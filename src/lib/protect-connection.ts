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
    if (allowSelfSigned) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }

    // Load the module at runtime only - never at build time
    const protect = await this.loadProtectApi();
    await protect.login(String(baseUrl).replace(/^https?:\/\//, ""), username, password);
    await protect.getBootstrap();
    
    console.log(`[PROTECT] Successfully connected to ${baseUrl}`);
    return protect;
  }

  private async loadProtectApi(): Promise<any> {
    try {
      // Try to load the module only at runtime
      if (typeof window !== 'undefined') {
        throw new Error('Cannot load unifi-protect in browser environment');
      }

      // Use Function constructor to avoid static analysis
      const dynamicImport = new Function('specifier', 'return import(specifier)');
      const protectModule = await dynamicImport('unifi-protect');
      return new protectModule.ProtectApi();
    } catch (error) {
      console.error('[PROTECT] Failed to load unifi-protect:', error);
      throw new Error('Unable to load UniFi Protect API. Please ensure unifi-protect package is installed.');
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
