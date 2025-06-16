import { performance } from 'perf_hooks';
import logger from './logger.js';

class PerfMonitor {
  constructor(client) {
    this.client = client;
    this.trackMetrics = new Map();
    this.interval = null;
  }

  recordRequest(guildId) {
    this.trackMetrics.set(guildId, { request: performance.now() });
  }

  recordTrackStart(guildId) {
    const metric = this.trackMetrics.get(guildId);
    if (metric && metric.request) {
      const delay = performance.now() - metric.request;
      metric.startDelay = delay;
      logger.info(`[PerfMonitor] Track start delay in guild ${guildId}: ${delay.toFixed(0)}ms`);
    }
  }

  startMemoryLogging(interval = 60000) {
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => {
      const mem = process.memoryUsage();
      logger.debug(
        `[PerfMonitor] rss=${(mem.rss / 1048576).toFixed(1)}MB heapUsed=${(mem.heapUsed / 1048576).toFixed(1)}MB`
      );
    }, interval);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.trackMetrics.clear();
  }
}

export default PerfMonitor;
