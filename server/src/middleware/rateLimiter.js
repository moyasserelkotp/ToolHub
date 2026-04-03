const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');

let store;

if (process.env.REDIS_URL) {
  try {
    const redisClient = new Redis(process.env.REDIS_URL);
    store = new RedisStore.default({
      sendCommand: (...args) => redisClient.call(...args),
    });
    console.log('✅ Redis Rate Limiter connected');
  } catch (err) {
    console.error('Failed to initialize Redis rate limiter store, using memory fallback:', err.message);
  }
}

const invokeRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 100, // Limit each agentId to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  store: store, // will default to MemoryStore if store is undefined
  keyGenerator: (req) => {
    // Rate limit by agent ID, fallback to IP if not provided
    return req.headers['x-agent-id'] || req.ip;
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded for this agent. Please try again later.'
    });
  }
});

module.exports = { invokeRateLimiter };
