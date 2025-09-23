// Memory monitoring utility for Raspberry Pi deployment
class MemoryMonitor {
  private static instance: MemoryMonitor;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly MEMORY_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly HIGH_MEMORY_THRESHOLD = 80; // Percentage of available memory

  static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Start memory monitoring with periodic logging
   */
  start(): void {
    if (this.intervalId) {
      console.log('[MEMORY] Memory monitoring already started');
      return;
    }

    console.log('[MEMORY] Starting memory monitoring (5-minute intervals)');
    
    // Initial memory check
    this.logMemoryUsage();

    // Set up periodic monitoring
    this.intervalId = setInterval(() => {
      this.logMemoryUsage();
    }, this.MEMORY_CHECK_INTERVAL);
  }

  /**
   * Stop memory monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[MEMORY] Memory monitoring stopped');
    }
  }

  /**
   * Log current memory usage with Pi-specific warnings
   */
  private logMemoryUsage(): void {
    try {
      const used = process.memoryUsage();
      const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
      const rssMB = Math.round(used.rss / 1024 / 1024);
      const externalMB = Math.round(used.external / 1024 / 1024);
      const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);

      const memoryStats = {
        rss: `${rssMB}MB`,
        heapUsed: `${heapUsedMB}MB`,
        heapTotal: `${heapTotalMB}MB`,
        external: `${externalMB}MB`,
        timestamp: new Date().toISOString()
      };

      // Log memory usage
      console.log('[MEMORY] Current usage:', memoryStats);

      // Check for high memory usage (typical Pi has 1-8GB RAM)
      if (rssMB > 500) { // 500MB threshold for Pi
        console.warn(`[MEMORY] ⚠️  HIGH MEMORY USAGE: ${rssMB}MB RSS - Consider restarting if on Raspberry Pi`);
      }

      if (heapUsedMB > 300) { // 300MB heap threshold
        console.warn(`[MEMORY] ⚠️  HIGH HEAP USAGE: ${heapUsedMB}MB - Camera streams may be consuming excessive memory`);
      }

      // Additional Pi-specific warnings
      if (rssMB > 800) {
        console.error(`[MEMORY] 🚨 CRITICAL MEMORY USAGE: ${rssMB}MB - System may become unstable on Raspberry Pi`);
      }

    } catch (error) {
      console.error('[MEMORY] Failed to check memory usage:', error);
    }
  }

  /**
   * Get current memory usage snapshot
   */
  getMemorySnapshot(): { rss: number; heapUsed: number; heapTotal: number; external: number } {
    const used = process.memoryUsage();
    return {
      rss: Math.round(used.rss / 1024 / 1024),
      heapUsed: Math.round(used.heapUsed / 1024 / 1024),
      heapTotal: Math.round(used.heapTotal / 1024 / 1024),
      external: Math.round(used.external / 1024 / 1024)
    };
  }

  /**
   * Force garbage collection if available (useful for Pi deployments)
   */
  forceGarbageCollection(): void {
    if (global.gc) {
      console.log('[MEMORY] Forcing garbage collection...');
      global.gc();
      console.log('[MEMORY] Garbage collection completed');
    } else {
      console.log('[MEMORY] Garbage collection not available (run with --expose-gc flag to enable)');
    }
  }
}

export const memoryMonitor = MemoryMonitor.getInstance();

