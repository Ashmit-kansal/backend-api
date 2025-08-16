const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Rate limiting for logs to prevent Railway rate limiting
class RateLimitedLogger {
  constructor() {
    this.logCounts = {};
    this.maxLogsPerSecond = 100; // Reduced from 500 to be safe
    this.maxLogsPerMinute = 3000;
  }

  canLog(level) {
    const now = Date.now();
    const secondKey = Math.floor(now / 1000);
    const minuteKey = Math.floor(now / 60000);

    // Initialize counters
    if (!this.logCounts[secondKey]) this.logCounts[secondKey] = 0;
    if (!this.logCounts[minuteKey]) this.logCounts[minuteKey] = 0;

    // Check limits
    if (this.logCounts[secondKey] >= this.maxLogsPerSecond) {
      return false;
    }
    if (this.logCounts[minuteKey] >= this.maxLogsPerMinute) {
      return false;
    }

    // Increment counters
    this.logCounts[secondKey]++;
    this.logCounts[minuteKey]++;

    // Clean up old entries (keep only last 2 minutes)
    Object.keys(this.logCounts).forEach(key => {
      if (parseInt(key) < Math.floor(now / 60000) - 2) {
        delete this.logCounts[key];
      }
    });

    return true;
  }
}

const rateLimiter = new RateLimitedLogger();

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance with rate limiting
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'warn', // Changed from 'info' to 'warn' to reduce logs
  format: logFormat,
  transports: [
    // Error logs only
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 3 // Reduced from 5
    }),
    // Combined logs with higher level
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log'),
      level: 'warn', // Changed from default to 'warn'
      maxsize: 5242880, // 5MB
      maxFiles: 3 // Reduced from 5
    })
  ]
});

// Add console logging for development only, with rate limiting
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    level: 'warn', // Changed from default to 'warn'
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Create a rate-limited logger wrapper
const rateLimitedLogger = {
  error: (message, meta) => {
    if (rateLimiter.canLog('error')) {
      logger.error(message, meta);
    }
  },
  warn: (message, meta) => {
    if (rateLimiter.canLog('warn')) {
      logger.warn(message, meta);
    }
  },
  info: (message, meta) => {
    if (rateLimiter.canLog('info')) {
      logger.info(message, meta);
    }
  },
  debug: (message, meta) => {
    if (rateLimiter.canLog('debug')) {
      logger.debug(message, meta);
    }
  }
};

module.exports = rateLimitedLogger;
