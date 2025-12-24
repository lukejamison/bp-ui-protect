import { memoryMonitor } from './memory-monitor';

interface CachedBootstrap {
  data: any;
  timestamp: number;
}

interface CachedCodec {
  codec: string;
  timestamp: number;
}

interface ConnectionMetadata {
  api: any;
  lastHealthCheck: number;
  isHealthy: boolean;
}

interface ActiveStream {
  livestream: any;
  timestamp: number;
  requestCount: number;
}

// Global connection manager to prevent multiple simultaneous logins
class ProtectConnectionManager {
  private static instance: ProtectConnectionManager;
  private connections = new Map<string, ConnectionMetadata>();
  private loginPromises = new Map<string, Promise<any>>();
  private bootstrapCache = new Map<string, CachedBootstrap>();
  private codecCache = new Map<string, CachedCodec>();
  private activeStreams = new Map<string, ActiveStream>();
  
  // Cache TTLs
  private readonly BOOTSTRAP_CACHE_TTL = 30 * 1000; // 30 seconds
  private readonly CODEC_CACHE_TTL = 5 * 60 * 1000; // 5 minutes (codecs rarely change)
  private readonly HEALTH_CHECK_INTERVAL = 60 * 1000; // 1 minute
  private readonly STREAM_REUSE_WINDOW = 5 * 1000; // 5 seconds - reuse stream if requested within this window

  static getInstance(): ProtectConnectionManager {
    if (!ProtectConnectionManager.instance) {
      ProtectConnectionManager.instance = new ProtectConnectionManager();
      // Initialize memory monitoring when the singleton is created
      ProtectConnectionManager.instance.initializeMemoryMonitoring();
    }
    return ProtectConnectionManager.instance;
  }

  private initializeMemoryMonitoring(): void {
    try {
      memoryMonitor.start();
      console.log('[PROTECT] Memory monitoring initialized for Pi deployment');
    } catch (error) {
      console.error('[PROTECT] Failed to initialize memory monitoring:', error);
    }
  }

  /**
   * Get cached bootstrap data if available and fresh
   */
  getCachedBootstrap(key: string): any | null {
    const cached = this.bootstrapCache.get(key);
    if (!cached) return null;
    
    const age = Date.now() - cached.timestamp;
    if (age > this.BOOTSTRAP_CACHE_TTL) {
      this.bootstrapCache.delete(key);
      return null;
    }
    
    console.log(`[PROTECT] Using cached bootstrap (age: ${Math.round(age / 1000)}s)`);
    return cached.data;
  }

  /**
   * Cache bootstrap data
   */
  private cacheBootstrap(key: string, data: any): void {
    this.bootstrapCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Get cached codec for a camera
   */
  getCachedCodec(cameraId: string): string | null {
    const cached = this.codecCache.get(cameraId);
    if (!cached) return null;
    
    const age = Date.now() - cached.timestamp;
    if (age > this.CODEC_CACHE_TTL) {
      this.codecCache.delete(cameraId);
      return null;
    }
    
    console.log(`[PROTECT] Using cached codec for ${cameraId}`);
    return cached.codec;
  }

  /**
   * Cache codec for a camera
   */
  cacheCodec(cameraId: string, codec: string): void {
    this.codecCache.set(cameraId, {
      codec,
      timestamp: Date.now()
    });
    console.log(`[PROTECT] Cached codec for ${cameraId}: ${codec}`);
  }

  /**
   * Check if a connection is healthy
   */
  private async isConnectionHealthy(metadata: ConnectionMetadata): Promise<boolean> {
    const timeSinceCheck = Date.now() - metadata.lastHealthCheck;
    
    // If we checked recently, use cached result
    if (timeSinceCheck < this.HEALTH_CHECK_INTERVAL) {
      return metadata.isHealthy;
    }
    
    // Perform health check
    try {
      const api = metadata.api;
      if (!api || !api.bootstrap) {
        return false;
      }
      
      // Simple check - does bootstrap data exist
      metadata.lastHealthCheck = Date.now();
      metadata.isHealthy = true;
      return true;
    } catch (error) {
      metadata.isHealthy = false;
      return false;
    }
  }

  async getConnection(baseUrl: string, username: string, password: string, allowSelfSigned: boolean): Promise<any> {
    const key = `${baseUrl}:${username}`;
    
    // Check existing connection health
    const existing = this.connections.get(key);
    if (existing) {
      const isHealthy = await this.isConnectionHealthy(existing);
      if (isHealthy && existing.api && existing.api.bootstrap) {
        console.log(`[PROTECT] Reusing healthy connection for ${key}`);
        return existing.api;
      } else {
        console.log(`[PROTECT] Existing connection unhealthy, reconnecting...`);
        this.connections.delete(key);
      }
    }

    // If login is already in progress, wait for it
    const existingLogin = this.loginPromises.get(key);
    if (existingLogin) {
      console.log(`[PROTECT] Waiting for existing login for ${key}`);
      return existingLogin;
    }

    // Start new login
    console.log(`[PROTECT] Creating new connection for ${key}`);
    const loginPromise = this.createConnection(baseUrl, username, password, allowSelfSigned, key);
    this.loginPromises.set(key, loginPromise);

    try {
      const protect = await loginPromise;
      this.connections.set(key, {
        api: protect,
        lastHealthCheck: Date.now(),
        isHealthy: true
      });
      return protect;
    } finally {
      this.loginPromises.delete(key);
    }
  }

  private async createConnection(baseUrl: string, username: string, password: string, allowSelfSigned: boolean, key: string): Promise<any> {
    try {
      if (allowSelfSigned) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      }

      console.log(`[PROTECT] Creating connection to ${baseUrl}...`);
      
      // Load the module at runtime only - never at build time
      const protect = await this.loadProtectApi();
      
      console.log(`[PROTECT] Attempting login for ${username}...`);
      
      // According to the docs, ProtectApi emits a 'login' event with success status
      // The returned boolean from login() might not be reliable with network issues
      let loginEventReceived = false;
      let loginEventSuccess = false;
      
      const loginEventPromise = new Promise<boolean>((resolve) => {
        protect.once('login', (success: boolean) => {
          loginEventReceived = true;
          loginEventSuccess = success;
          console.log(`[PROTECT] Login event received: ${success ? 'success' : 'failed'}`);
          resolve(success);
        });
      });
      
      // Start the login attempt
      const loginPromise = protect.login(String(baseUrl).replace(/^https?:\/\//, ""), username, password);
      
      // Wait for either the login method to complete or the event to fire (whichever comes first)
      const loginSuccess = await Promise.race([
        loginPromise,
        loginEventPromise,
        new Promise<boolean>((_, reject) => 
          setTimeout(() => reject(new Error('Login timeout after 60s')), 60000)
        )
      ]).catch((error) => {
        console.error(`[PROTECT] Login error:`, error instanceof Error ? error.message : error);
        return false;
      });
      
      // Give a moment for the event to fire if it hasn't yet
      if (!loginEventReceived) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Use the event result if available, otherwise use the return value
      const finalLoginSuccess = loginEventReceived ? loginEventSuccess : loginSuccess;
      
      if (!finalLoginSuccess) {
        throw new Error('Login failed - check credentials, network connectivity, and ensure UNVR is accessible');
      }
      
      console.log(`[PROTECT] Login successful, getting bootstrap...`);
      
      // According to the official docs, getBootstrap() returns a boolean
      // The bootstrap data is then available on protect.bootstrap (event-driven)
      const bootstrapSuccess = await Promise.race([
        protect.getBootstrap(),
        new Promise<boolean>((_, reject) => 
          setTimeout(() => reject(new Error('Bootstrap timeout after 60s')), 60000)
        )
      ]);
      
      console.log(`[PROTECT] getBootstrap() returned:`, bootstrapSuccess);
      
      if (!bootstrapSuccess) {
        throw new Error('Bootstrap fetch failed - unable to retrieve camera data from NVR');
      }
      
      // Give the library a moment to populate the bootstrap data
      // The library uses an event-driven architecture internally
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Access bootstrap data
      const bootstrapData = (protect as any)._bootstrap || protect.bootstrap;
      
      if (bootstrapData && Object.keys(bootstrapData).length > 0) {
        // Store it as public property for easy access
        (protect as any).bootstrap = bootstrapData;
        this.cacheBootstrap(key, bootstrapData);
        console.log(`[PROTECT] Bootstrap cached with ${bootstrapData.cameras?.length ?? 0} cameras`);
      } else {
        console.warn(`[PROTECT] Warning: Bootstrap data is empty - NVR may have no cameras configured`);
        // Don't throw - NVR might legitimately have no cameras
        (protect as any).bootstrap = { cameras: [], lights: [], sensors: [], chimes: [], viewers: [] };
      }
      
      console.log(`[PROTECT] Successfully connected to ${baseUrl}`);
      return protect;
    } catch (error) {
      console.error(`[PROTECT] Connection failed for ${baseUrl}:`, {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  private async loadProtectApi(): Promise<any> {
    try {
      // Try to load the module only at runtime
      if (typeof window !== 'undefined') {
        throw new Error('Cannot load unifi-protect in browser environment');
      }

      console.log('[PROTECT] Attempting to load unifi-protect module...');
      
      // Use Function constructor to avoid static analysis
      const dynamicImport = new Function('specifier', 'return import(specifier)');
      const protectModule = await dynamicImport('unifi-protect');
      
      console.log('[PROTECT] Module loaded successfully, creating ProtectApi instance...');
      const api = new protectModule.ProtectApi();
      console.log('[PROTECT] ProtectApi instance created successfully');
      
      return api;
    } catch (error) {
      console.error('[PROTECT] Failed to load unifi-protect module:', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        type: typeof error
      });
      throw new Error(`Unable to load UniFi Protect API: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Clean up old connections
  cleanup(baseUrl: string, username: string): void {
    const key = `${baseUrl}:${username}`;
    this.connections.delete(key);
    this.loginPromises.delete(key);
    this.bootstrapCache.delete(key);
  }

  /**
   * Clear all caches - useful for debugging or after errors
   */
  clearAllCaches(): void {
    this.bootstrapCache.clear();
    this.codecCache.clear();
    console.log('[PROTECT] All caches cleared');
  }

  /**
   * Get or create a stream for a camera - deduplicates requests
   */
  getOrCreateStream(cameraId: string, protect: any): any {
    const existing = this.activeStreams.get(cameraId);
    
    // Reuse existing stream if it was just created
    if (existing) {
      const age = Date.now() - existing.timestamp;
      if (age < this.STREAM_REUSE_WINDOW) {
        existing.requestCount++;
        console.log(`[PROTECT] Reusing active stream for ${cameraId} (${existing.requestCount} requests)`);
        return existing.livestream;
      } else {
        // Clean up old stream
        try {
          existing.livestream.stop();
        } catch (e) {
          // Ignore errors stopping old stream
        }
        this.activeStreams.delete(cameraId);
      }
    }

    // Create new stream
    console.log(`[PROTECT] Creating new stream for ${cameraId}`);
    const livestream = protect.createLivestream();
    this.activeStreams.set(cameraId, {
      livestream,
      timestamp: Date.now(),
      requestCount: 1
    });

    return livestream;
  }

  /**
   * Remove a stream from active streams
   */
  removeStream(cameraId: string): void {
    const existing = this.activeStreams.get(cameraId);
    if (existing) {
      try {
        existing.livestream.stop();
      } catch (e) {
        // Ignore errors
      }
      this.activeStreams.delete(cameraId);
      console.log(`[PROTECT] Removed stream for ${cameraId}`);
    }
  }
}

export const protectConnectionManager = ProtectConnectionManager.getInstance();
