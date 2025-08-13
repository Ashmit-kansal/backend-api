const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

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

// Rate limiting - different limits for authenticated vs unauthenticated users
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: (req) => {
    // If user is authenticated, allow 400 requests per minute
    // If not authenticated, allow 300 requests per minute
    return req.user ? 400 : 300;
  },
  keyGenerator: (req) => {
    // Use user ID if authenticated, fallback to IP for unauthenticated
    return req.user ? req.user._id : req.ip;
  },
  message: {
    success: false,
    message: (req) => {
      const limit = req.user ? 400 : 300;
      return `Rate limit exceeded. ${req.user ? 'Authenticated users' : 'Unauthenticated users'} are limited to ${limit} requests per minute.`;
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all routes
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
});

app.use('/api/auth/', authLimiter);

// CORS configuration - more restrictive
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      console.log('🔍 CORS check - No origin (mobile app/curl), allowing');
      return callback(null, true);
    }
    
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002'
    ];
    
    console.log(`🔍 CORS check - Origin: ${origin}, Allowed: ${allowedOrigins.join(', ')}`);
    console.log(`🔍 Environment FRONTEND_URL: ${process.env.FRONTEND_URL}`);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      console.log(`✅ CORS allowed for origin: ${origin}`);
      callback(null, true);
    } else {
      console.warn(`🚨 Blocked request from unauthorized origin: ${origin}`);
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

// Additional CORS debugging middleware
app.use((req, res, next) => {
  console.log(`🌐 Request: ${req.method} ${req.path} from ${req.get('Origin') || 'No Origin'}`);
  console.log(`🔍 Headers:`, req.headers);
  
  // Handle preflight OPTIONS request explicitly
  if (req.method === 'OPTIONS') {
    console.log('🔄 Handling OPTIONS preflight request');
    res.header('Access-Control-Allow-Origin', req.get('Origin') || 'http://localhost:3000');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.status(204).end();
    return;
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

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/manga-reader', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  console.log('⚠️  Server will run without database connection');
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
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
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
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

const PORT = process.env.PORT || 3004;

// Listen on all network interfaces for mobile access
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Accessible at: http://0.0.0.0:${PORT}`);
  console.log(`🌐 Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`🔒 Security middleware enabled: Helmet, Rate Limiting, CORS`);
});

module.exports = app; 