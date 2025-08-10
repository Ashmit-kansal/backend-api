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
const Notification = require('../models/Notification');
const ImageUploadService = require('../services/imageUploadService');
const Manga = require('../models/Manga'); // Added Manga model import

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

// Register user
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = new User({
      username,
      email,
      password: hashedPassword
    });

    await user.save();

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
          avatar: user.avatar
        }
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

// Login user
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
          avatar: user.avatar
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
    console.error('Get user error:', error);
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
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
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

    // Delete user's data
    const userBookmarks = await Bookmark.find({ userId: req.user.id });
    
    // Update bookmarkCount for all manga that had bookmarks from this user
    for (const bookmark of userBookmarks) {
      await Manga.findByIdAndUpdate(bookmark.mangaId, {
        $inc: { 'stats.bookmarkCount': -1 }
      });
    }
    
    await Promise.all([
      Bookmark.deleteMany({ userId: req.user.id }),
      Rating.deleteMany({ userId: req.user.id }),
      Comment.deleteMany({ userId: req.user.id }),
      Notification.deleteMany({ userId: req.user.id })
    ]);

    // Delete user's avatar from Cloudinary
    if (user.avatarPublicId) {
      await ImageUploadService.deleteUserAvatar(user.avatarPublicId);
    }

    // Delete user
    await User.findByIdAndDelete(req.user.id);

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

    // Upload to Cloudinary and update user
    const result = await ImageUploadService.updateUserAvatar(user, req.file.buffer);

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
    console.error('Upload avatar error:', error);
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

    const avatarInfo = await ImageUploadService.getAvatarUpdateInfo(user);

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

module.exports = router;
