const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  otp: {
    type: String,
    required: true,
    length: 6
  },
  purpose: {
    type: String,
    enum: ['verification', 'password_reset'],
    required: true
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  expiresAt: {
    type: Date,
    required: true,
    default: function() {
      return new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
    }
  }
}, {
  timestamps: true
});

// Index for better query performance
otpSchema.index({ email: 1, purpose: 1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-delete expired OTPs

// Static method to generate OTP
otpSchema.statics.generateOTP = function() {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Static method to create OTP
otpSchema.statics.createOTP = async function(email, purpose) {
  try {
    // Delete any existing unused OTPs for this email and purpose
    await this.deleteMany({ 
      email: email.toLowerCase(), 
      purpose, 
      isUsed: false 
    });

    // Generate new OTP
    const otp = this.generateOTP();
    
    // Create OTP record
    const otpRecord = new this({
      email: email.toLowerCase(),
      otp,
      purpose,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    });

    await otpRecord.save();
    return otp;
  } catch (error) {
    console.error('Error creating OTP:', error);
    throw error;
  }
};

// Static method to verify OTP
otpSchema.statics.verifyOTP = async function(email, otp, purpose) {
  const otpRecord = await this.findOne({
    email: email.toLowerCase(),
    otp,
    purpose,
    isUsed: false,
    expiresAt: { $gt: new Date() }
  });

  if (!otpRecord) {
    return false;
  }

  // Mark OTP as used
  otpRecord.isUsed = true;
  await otpRecord.save();

  return true;
};

// Static method to check if OTP exists and is valid
otpSchema.statics.isValidOTP = async function(email, otp, purpose) {
  const otpRecord = await this.findOne({
    email: email.toLowerCase(),
    otp,
    purpose,
    isUsed: false,
    expiresAt: { $gt: new Date() }
  });

  return !!otpRecord;
};

const OTP = mongoose.model('OTP', otpSchema);

module.exports = OTP;
