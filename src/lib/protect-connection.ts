// Global connection manager to prevent multiple simultaneous logins
class ProtectConnectionManager {
  private static instance: ProtectConnectionManager;
  private connections = new Map<string, any>();
  private loginPromises = new Map<string, Promise<any>>();

  static getInstance(): ProtectConnectionManager {
    if (!ProtectConnectionManager.instance) {
      ProtectConnectionManager.instance = new ProtectConnectionManager();
    }
    return ProtectConnectionManager.instance;
  }

  async getConnection(baseUrl: string, username: string, password: string, allowSelfSigned: boolean): Promise<any> {
    const key = `${baseUrl}:${username}`;
    
    // Return existing connection if available and still valid
    const existing = this.connections.get(key);
    if (existing && existing.bootstrap) {
      console.log(`[PROTECT] Reusing existing connection for ${key}`);
      return existing;
    }

    // If login is already in progress, wait for it
    const existingLogin = this.loginPromises.get(key);
    if (existingLogin) {
      console.log(`[PROTECT] Waiting for existing login for ${key}`);
      return existingLogin;
    }

    // Start new login
    console.log(`[PROTECT] Creating new connection for ${key}`);
    const loginPromise = this.createConnection(baseUrl, username, password, allowSelfSigned);
    this.loginPromises.set(key, loginPromise);

    try {
      const protect = await loginPromise;
      this.connections.set(key, protect);
      return protect;
    } finally {
      this.loginPromises.delete(key);
    }
  }

  private async createConnection(baseUrl: string, username: string, password: string, allowSelfSigned: boolean): Promise<any> {
    try {
      if (allowSelfSigned) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      }

      console.log(`[PROTECT] Creating connection to ${baseUrl}...`);
      
      // Load the module at runtime only - never at build time
      const protect = await this.loadProtectApi();
      
      console.log(`[PROTECT] Attempting login for ${username}...`);
      await protect.login(String(baseUrl).replace(/^https?:\/\//, ""), username, password);
      
      console.log(`[PROTECT] Login successful, getting bootstrap...`);
      await protect.getBootstrap();
      
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
  }
}

export const protectConnectionManager = ProtectConnectionManager.getInstance();
