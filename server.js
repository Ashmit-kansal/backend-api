const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const logger = require('./src/config/logger');
require('dotenv').config();

const app = express();

// Trust proxy for Railway and other cloud platforms
// This is required for express-rate-limit to work correctly with X-Forwarded-For headers
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", process.env.FRONTEND_URL || 'http://localhost:3000'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration - must come BEFORE rate limiting
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }
    
    // Clean up FRONTEND_URL by removing trailing slash
    const frontendUrl = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/\/$/, '') : 'http://localhost:3000';
    
    // In production, only allow the FRONTEND_URL from environment variable
    // In development, allow localhost for testing
    const allowedOrigins = process.env.NODE_ENV === 'production' 
      ? [frontendUrl] // Production: Only FRONTEND_URL
      : [frontendUrl, 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002']; // Development: FRONTEND_URL + localhost
    
    // Debug logging for CORS
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 CORS Check:', { origin, allowedOrigins, frontendUrl });
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked', { origin, allowedOrigins });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Length', 'X-Total-Count'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: (req) => {
    return req.user ? 400 : 300;
  },
  keyGenerator: (req) => {
    return req.user ? req.user._id : req.ip;
  },
  message: {
    success: false,
    message: 'Rate limit exceeded. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Add CORS headers to rate limit responses
  handler: (req, res) => {
    const origin = req.get('Origin');
    const frontendUrl = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/\/$/, '') : 'http://localhost:3000';
    // In production, only allow the FRONTEND_URL from environment variable
    // In development, allow localhost for testing
    const allowedOrigins = process.env.NODE_ENV === 'production' 
      ? [frontendUrl] // Production: Only FRONTEND_URL
      : [frontendUrl, 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002']; // Development: FRONTEND_URL + localhost
    
    if (origin && allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Methods', 'GET', 'POST', 'PUT', 'DELETE', 'OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type', 'Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    const limit = req.user ? 400 : 300;
    const message = `Rate limit exceeded. ${req.user ? 'Authenticated users' : 'Unauthenticated users'} are limited to ${limit} requests per minute.`;
    
    res.status(429).json({
      success: false,
      message: message
    });
  }
});

// Apply rate limiting to all routes AFTER CORS and test endpoints
app.use('/api/', limiter);

// Stricter rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 50, // limit each IP to 50 requests per minute
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Add CORS headers to auth rate limit responses
  handler: (req, res) => {
    const origin = req.get('Origin');
    const frontendUrl = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/\/$/, '') : 'http://localhost:3000';
    // In production, only allow the FRONTEND_URL from environment variable
    // In development, allow localhost for testing
    const allowedOrigins = process.env.NODE_ENV === 'production' 
      ? [frontendUrl] // Production: Only FRONTEND_URL
      : [frontendUrl, 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002']; // Development: FRONTEND_URL + localhost
    
    if (origin && allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Methods', 'GET', 'POST', 'PUT', 'DELETE', 'OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type', 'Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts, please try again later.'
    });
  }
});

app.use('/api/auth/', authLimiter);

// Additional CORS debugging middleware
app.use((req, res, next) => {
  // Only log in development and only for errors
  if (process.env.NODE_ENV === 'development' && req.method !== 'OPTIONS') {
    // Minimal logging - only log actual errors or unusual requests
    if (req.path.includes('/api/') && !req.path.includes('/health')) {
      // Skip logging for health checks and common API calls
      next();
      return;
    }
  }
  
  next();
});

// Body parsing middleware with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

// Test endpoint for CORS verification - bypass rate limiting
app.get('/api/test-cors', (req, res) => {
  res.json({ 
    success: true, 
    message: 'CORS test successful',
    timestamp: new Date().toISOString(),
    origin: req.get('Origin')
  });
});

// Database connection
logger.info('Attempting to connect to MongoDB');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/manga-reader', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  logger.info('MongoDB connected successfully');
  startServer();
})
.catch(err => {
  logger.error('MongoDB connection failed', { 
    error: err.message, 
    stack: err.stack,
    mongoUri: process.env.MONGODB_URI ? 'Set' : 'Not set'
  });
  
  if (process.env.NODE_ENV === 'production') {
    logger.error('Exiting due to database connection failure in production');
    process.exit(1);
  }
});

// Routes
app.use('/api/auth', require('./src/routes/auth'));

app.use('/api/ratings', require('./src/routes/ratings'));
app.use('/api/comments', require('./src/routes/comments'));
app.use('/api/manga', require('./src/routes/manga'));
app.use('/api/chapters', require('./src/routes/chapters'));
app.use('/api/trending', require('./src/routes/trending'));
app.use('/api/genres', require('./src/routes/genres'));
app.use('/api/bookmarks', require('./src/routes/bookmarks'));
app.use('/api/manga-requests', require('./src/routes/mangaRequests'));
app.use('/api/error-reports', require('./src/routes/errorReports'));


// Health check endpoint
app.get('/health', (req, res) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    port: process.env.PORT,
    mongoConnected: mongoose.connection.readyState === 1,
    mongoState: mongoose.connection.readyState
  };
  
  // Only log health check errors, not successful checks
  if (mongoose.connection.readyState !== 1) {
    logger.warn('Health check failed - MongoDB not connected', { state: mongoose.connection.readyState });
  }
  
  // Return 200 for Railway health check
  res.status(200).json(healthCheck);
});

// Additional health check for Railway
app.get('/', (req, res) => {
  res.json({ 
    message: 'Manga Reader API is running',
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  // Log error with context
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
  
  // Don't expose internal errors to clients
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS policy violation'
    });
  }
  
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  // Only log 404s for non-API routes to reduce noise
  if (!req.url.startsWith('/api/') && !req.url.startsWith('/health')) {
    logger.warn('Route not found', { 
      url: req.url, 
      method: req.method, 
      ip: req.ip 
    });
  }
  
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

const PORT = process.env.PORT || 3004;

// Log the port being used

// Start server function
function startServer() {
  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info('Server started successfully', { 
      port: PORT, 
      environment: process.env.NODE_ENV
    });
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
      logger.info('HTTP server closed');
      mongoose.connection.close(false, () => {
        logger.info('MongoDB connection closed');
        process.exit(0);
      });
    });
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    server.close(() => {
      logger.info('HTTP server closed');
      mongoose.connection.close(false, () => {
        logger.info('MongoDB connection closed');
        process.exit(0);
      });
    });
  });
}

module.exports = app; 