const { body, param, query, validationResult } = require('express-validator');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

// Sanitize common inputs
const sanitizeInput = (req, res, next) => {
  // Sanitize body
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim();
        // Remove potential script tags
        req.body[key] = req.body[key].replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      }
    });
  }
  
  // Sanitize query parameters
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = req.query[key].trim();
      }
    });
  }
  
  next();
};

// Validation rules for common operations
const authValidation = {
  register: [
    body('username')
      .isLength({ min: 3, max: 30 })
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username must be 3-30 characters, alphanumeric and underscores only'),
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Must be a valid email address'),
    body('password')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must be at least 8 characters with uppercase, lowercase, number and special character'),
    body('name')
      .isLength({ min: 2, max: 100 })
      .trim()
      .escape()
      .withMessage('Name must be 2-100 characters'),
    validate
  ],
  
  login: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Must be a valid email address'),
    body('password')
      .notEmpty()
      .withMessage('Password is required'),
    validate
  ],
  
  changePassword: [
    body('currentPassword')
      .notEmpty()
      .withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('New password must be at least 8 characters with uppercase, lowercase, number and special character'),
    validate
  ]
};

const mangaValidation = {
  search: [
    query('search')
      .optional()
      .isLength({ min: 2, max: 100 })
      .trim()
      .escape()
      .withMessage('Search query must be 2-100 characters'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    validate
  ],
  
  bySlug: [
    param('slug')
      .isLength({ min: 1, max: 200 })
      .matches(/^[a-z0-9-]+$/)
      .withMessage('Slug must be lowercase letters, numbers and hyphens only'),
    validate
  ]
};

const commentValidation = {
  create: [
    body('content')
      .isLength({ min: 1, max: 1000 })
      .trim()
      .escape()
      .withMessage('Comment must be 1-1000 characters'),
    body('mangaId')
      .isMongoId()
      .withMessage('Invalid manga ID'),
    body('chapterId')
      .optional()
      .isMongoId()
      .withMessage('Invalid chapter ID'),
    validate
  ],
  
  update: [
    param('id')
      .isMongoId()
      .withMessage('Invalid comment ID'),
    body('content')
      .isLength({ min: 1, max: 1000 })
      .trim()
      .escape()
      .withMessage('Comment must be 1-1000 characters'),
    validate
  ]
};

const ratingValidation = {
  submit: [
    body('mangaId')
      .isMongoId()
      .withMessage('Invalid manga ID'),
    body('rating')
      .isFloat({ min: 1, max: 5 })
      .withMessage('Rating must be between 1 and 5'),
    body('review')
      .optional()
      .isLength({ max: 1000 })
      .trim()
      .escape()
      .withMessage('Review must be maximum 1000 characters'),
    validate
  ]
};

const errorReportValidation = {
  submit: [
    body('type')
      .isIn(['comment', 'chapter'])
      .withMessage('Type must be either comment or chapter'),
    body('reason')
      .isLength({ min: 1, max: 200 })
      .trim()
      .escape()
      .withMessage('Reason must be 1-200 characters'),
    body('description')
      .optional()
      .isLength({ max: 1000 })
      .trim()
      .escape()
      .withMessage('Description must be maximum 1000 characters'),
    body('mangaId')
      .isMongoId()
      .withMessage('Invalid manga ID'),
    validate
  ]
};

module.exports = {
  validate,
  sanitizeInput,
  authValidation,
  mangaValidation,
  commentValidation,
  ratingValidation,
  errorReportValidation
};
