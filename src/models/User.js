const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  avatar: {
    type: String,
    default: null
  },
  avatarPublicId: {
    type: String,
    default: null
  },
  avatarUpdatedAt: {
    type: Date,
    default: null
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastActive: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Check if user can update avatar (once per week)
userSchema.methods.canUpdateAvatar = function() {
  if (!this.avatarUpdatedAt) return true;
  
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  return this.avatarUpdatedAt < oneWeekAgo;
};

// Get avatar update cooldown
userSchema.methods.getAvatarUpdateCooldown = function() {
  if (!this.avatarUpdatedAt) return { days: 0 };
  
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  const timeDiff = this.avatarUpdatedAt - oneWeekAgo;
  const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
  
  return {
    days: Math.max(0, daysRemaining),
    canUpdate: daysRemaining <= 0
  };
};

// Update last active
userSchema.methods.updateLastActive = function() {
  this.lastActive = new Date();
  return this.save();
};

module.exports = mongoose.model('User', userSchema); 