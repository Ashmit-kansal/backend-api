const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Bookmark = require('../models/Bookmark');
const Rating = require('../models/Rating');
const Comment = require('../models/Comment');
const R2ImageUploadService = require('../services/r2ImageUploadService');
const Manga = require('../models/Manga'); // Added Manga model import
const OTP = require('../models/OTP');
const { sendOTPEmail, sendWelcomeEmail } = require('../services/emailService');
// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});
// Register user - only creates a temporary record, user is created after OTP verification
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, name } = req.body;
    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });
    if (existingUser) {
      // Check if existing user is banned
      if (existingUser.isBanned) {
        return res.status(400).json({
          success: false,
          message: 'This email or username is associated with a banned account. Registration not allowed.'
        });
      }
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }
    // Generate and send OTP for email verification
    const otp = await OTP.createOTP(email, 'verification');
    await sendOTPEmail(email, otp, 'verification');
    console.log(`📧 Registration OTP sent to: ${email} for user: ${username}`);
    res.json({
      success: true,
      message: 'Registration initiated! Please check your email for verification OTP.',
      data: {
        email: email,
        username: username,
        name: name
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed'
    });
  }
});
// Verify email and create user
router.post('/verify-email', async (req, res) => {
  try {
    const { email, otp, username, password, name } = req.body;
    if (!email || !otp || !username || !password || !name) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }
    // Verify OTP
    const isValid = await OTP.verifyOTP(email, otp, 'verification');
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }
    // Check if user already exists (double-check)
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });
    if (existingUser) {
      // Check if existing user is banned
      if (existingUser.isBanned) {
        return res.status(400).json({
          success: false,
          message: 'This email or username is associated with a banned account. Registration not allowed.'
        });
      }
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    // Create verified user
    const user = new User({
      username,
      email,
      password: hashedPassword,
      name
    });
    await user.save();
    // Send welcome email
    try {
      await sendWelcomeEmail(email, username);
    } catch (emailError) {
      console.warn('Failed to send welcome email:', emailError);
    }
    // Generate token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      success: true,
      message: 'Email verified and account created successfully!',
      data: {
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          createdAt: user.createdAt,
          name: user.name
        }
      }
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Email verification failed'
    });
  }
});
// Login user - no email verification check needed since all users are verified
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    // Generate token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          createdAt: user.createdAt,
          name: user.name
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
});
// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get user data'
    });
  }
});
// Get user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    // Get user stats
    const [bookmarkCount, ratingCount, commentCount] = await Promise.all([
      Bookmark.countDocuments({ userId: req.user.id }),
      Rating.countDocuments({ userId: req.user.id }),
      Comment.countDocuments({ userId: req.user.id })
    ]);
    res.json({
      success: true,
      data: {
        user,
        stats: {
          bookmarks: bookmarkCount,
          ratings: ratingCount,
          comments: commentCount
        }
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile data'
    });
  }
});
// Change password
router.put('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    // Update password
    user.password = hashedPassword;
    await user.save();
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
});
// Update profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Username is required'
      });
    }
    // Check if username is valid
    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({
        success: false,
        message: 'Username must be between 3 and 30 characters'
      });
    }
    // Check if username is already taken by another user
    const existingUser = await User.findOne({ 
      username: username,
      _id: { $ne: req.user.id } // Exclude current user
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Username is already taken'
      });
    }
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    // Update username
    user.username = username;
    await user.save();
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        username: user.username
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});
// Delete account
router.delete('/delete-account', auth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required to delete account'
      });
    }
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Password is incorrect'
      });
    }
    // Soft delete: Update user data instead of deleting
    // Use a shorter format to fit within username maxlength (30 characters)
    const deletedId = `del_${user._id.toString().slice(-12)}`; // del_ + last 12 chars of ObjectId
    // Update user to soft deleted state
    user.username = deletedId;
    // Preserve email if user is banned to prevent account recreation
    if (user.isBanned) {
      // Keep original email to prevent banned users from recreating accounts
    } else {
      // Only change email for non-banned users
      user.email = deletedId;
    }
    user.password = 'deleted'; // Set a dummy password
    user.avatar = null;
    user.avatarPublicId = null;
    user.avatarUpdatedAt = null;
    user.isActive = false;
    user.lastActive = new Date();
    await user.save();
            // Delete user's avatar from R2 if it exists
    if (user.avatarPublicId) {
      try {
        await R2ImageUploadService.deleteUserAvatar(user.avatarPublicId);
      } catch (avatarError) {
        console.warn('Could not delete avatar from R2:', avatarError);
      }
    }
    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete account'
    });
  }
});
// Upload avatar
router.post('/upload-avatar', auth, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    // Check if user can update avatar
    if (!user.canUpdateAvatar()) {
      return res.status(400).json({
        success: false,
        message: 'Avatar can only be updated once per week'
      });
    }
    // Upload to R2 and update user
    const result = await R2ImageUploadService.updateUserAvatar(user, req.file.buffer);
    res.json({
      success: true,
      data: {
        avatar: result.avatar,
        avatarPublicId: result.avatarPublicId,
        avatarUpdatedAt: result.avatarUpdatedAt
      },
      message: 'Avatar updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to upload avatar'
    });
  }
});
// Get avatar info
router.get('/avatar-info', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    const avatarInfo = await R2ImageUploadService.getAvatarUpdateInfo(user);
    res.json({
      success: true,
      data: avatarInfo
    });
  } catch (error) {
    console.error('Get avatar info error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get avatar info'
    });
  }
});
// Send OTP for email verification
router.post('/send-otp', async (req, res) => {
  try {
    const { email, purpose } = req.body;
    if (!email || !purpose) {
      return res.status(400).json({
        success: false,
        message: 'Email and purpose are required'
      });
    }
    if (!['verification', 'password_reset'].includes(purpose)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid purpose'
      });
    }
    // Check if user exists for password reset
    if (purpose === 'password_reset') {
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
    }
    // Generate and send OTP
    const otp = await OTP.createOTP(email, purpose);
    await sendOTPEmail(email, otp, purpose);
    res.json({
      success: true,
      message: 'OTP sent successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP'
    });
  }
});
// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp, purpose } = req.body;
    if (!email || !otp || !purpose) {
      return res.status(400).json({
        success: false,
        message: 'Email, OTP, and purpose are required'
      });
    }
    const isValid = await OTP.verifyOTP(email, otp, purpose);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }
    res.json({
      success: true,
      message: 'OTP verified successfully'
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP'
    });
  }
});
// Resend OTP
router.post('/resend-otp', async (req, res) => {
  try {
    const { email, purpose } = req.body;
    if (!email || !purpose) {
      return res.status(400).json({
        success: false,
        message: 'Email and purpose are required'
      });
    }
    // Check if user exists for password reset
    if (purpose === 'password_reset') {
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
    }
    // Generate and send new OTP
    const otp = await OTP.createOTP(email, purpose);
    await sendOTPEmail(email, otp, purpose);
    res.json({
      success: true,
      message: 'OTP resent successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to resend OTP'
    });
  }
});
// Forgot password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }
    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    // Generate and send OTP
    const otp = await OTP.createOTP(email, 'password_reset');
    await sendOTPEmail(email, otp, 'password_reset');
    res.json({
      success: true,
      message: 'Password reset OTP sent successfully'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send password reset OTP'
    });
  }
});
// Reset password with OTP
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, OTP, and new password are required'
      });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }
    // Verify OTP
    const isValid = await OTP.verifyOTP(email, otp, 'password_reset');
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }
    // Update password
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    // Hash the new password before saving
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();
    res.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
});
module.exports = router;