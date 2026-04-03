const Redis = require('ioredis');

class CacheService {
  constructor() {
    this.redis = null;
    this.memoryCache = new Map();

    if (process.env.REDIS_URL) {
      try {
        this.redis = new Redis(process.env.REDIS_URL, {
          maxRetriesPerRequest: 1,
          retryStrategy(times) {
            console.warn(`Redis connection retry ${times}`);
            if (times > 3) return null; // stop retrying
            return Math.min(times * 50, 2000);
          }
        });
        
        this.redis.on('error', (err) => {
          console.error('Redis cache error:', err.message);
        });
        this.redis.on('connect', () => {
          console.log('✅ Redis Cache connected');
        });
      } catch (err) {
        console.error('Failed to initialize Redis fallback to memory cache:', err.message);
      }
    } else {
      console.log('ℹ️ REDIS_URL not set, using in-memory cache');
    }
  }

  async get(key) {
    if (this.redis && this.redis.status === 'ready') {
      try {
        const val = await this.redis.get(key);
        return val ? JSON.parse(val) : null;
      } catch (err) {
        console.error(`Redis GET error for key ${key}:`, err.message);
      }
    }
    return this.memoryCache.get(key) || null;
  }

  async set(key, value, ttlSeconds = null) {
    if (this.redis && this.redis.status === 'ready') {
      try {
        const strVal = JSON.stringify(value);
        if (ttlSeconds) {
          await this.redis.set(key, strVal, 'EX', ttlSeconds);
        } else {
          await this.redis.set(key, strVal);
        }
        return true;
      } catch (err) {
        console.error(`Redis SET error for key ${key}:`, err.message);
      }
    }
    
    this.memoryCache.set(key, value);
    // Simple TTL for in-memory if needed
    if (ttlSeconds) {
      setTimeout(() => this.memoryCache.delete(key), ttlSeconds * 1000);
    }
    return true;
  }

  async del(key) {
    if (this.redis && this.redis.status === 'ready') {
      try {
        await this.redis.del(key);
        return true;
      } catch (err) {
        console.error(`Redis DEL error for key ${key}:`, err.message);
      }
    }
    return this.memoryCache.delete(key);
  }
}

// Export singleton instance
module.exports = new CacheService();
