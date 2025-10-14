const mongoose = require('mongoose');

const errorReportSchema = new mongoose.Schema({
  // Report type: 'comment', 'reply' or 'chapter'
  type: {
    type: String,
    enum: ['comment', 'reply', 'chapter'],
    required: true
  },
  
  // User who submitted the report
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // For comment reports
  commentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  },
  // For reply reports
  replyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reply'
  },
  
  // For chapter reports
  mangaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Manga'
  },
  
  chapterNumber: {
    type: String
  },
  
  // ID of the user/content being reported against
  defaulterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Made optional since we can't always determine the defaulter
  },
  
  // Report details
  reason: {
    type: String,
    enum: ['spam', 'inappropriate', 'harassment', 'broken', 'other'],
    required: true
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  
  // Report status
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'resolved', 'dismissed'],
    default: 'pending'
  },
  
  // Admin/mod review
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  reviewedAt: Date,
  
  reviewNotes: String,
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
errorReportSchema.index({ type: 1, status: 1 });
errorReportSchema.index({ userId: 1 });
errorReportSchema.index({ defaulterId: 1 });
errorReportSchema.index({ commentId: 1 });
errorReportSchema.index({ replyId: 1 });
errorReportSchema.index({ mangaId: 1, chapterNumber: 1 });
errorReportSchema.index({ createdAt: -1 });

// Pre-save middleware to update updatedAt
errorReportSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static method to get reports by type and status
errorReportSchema.statics.getReportsByType = function(type, status = null) {
  const query = { type };
  if (status) query.status = status;
  
  return this.find(query)
    .populate('userId', 'username email')
    .populate('defaulterId', 'username email')
    .populate('commentId', 'content userId')
    .populate('replyId', 'content userId')
    .populate('mangaId', 'title')
    .populate('reviewedBy', 'username')
    .sort({ createdAt: -1 });
};

// Static method to get user's reports
errorReportSchema.statics.getUserReports = function(userId) {
  return this.find({ userId })
    .populate('defaulterId', 'username email')
    .populate('commentId', 'content userId')
    .populate('replyId', 'content userId')
    .populate('mangaId', 'title')
    .sort({ createdAt: -1 });
};

// Instance method to mark as reviewed
errorReportSchema.methods.markAsReviewed = function(adminId, status, notes = '') {
  this.status = status;
  this.reviewedBy = adminId;
  this.reviewedAt = new Date();
  this.reviewNotes = notes;
  return this.save();
};

module.exports = mongoose.model('ErrorReport', errorReportSchema);
