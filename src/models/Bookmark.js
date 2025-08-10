const mongoose = require('mongoose');

const bookmarkSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  mangaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Manga',
    required: true
  },
  lastReadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chapter',
    default: null
  }
}, {
  timestamps: true
});

// Compound index to ensure one bookmark per user per manga
bookmarkSchema.index({ userId: 1, mangaId: 1 }, { unique: true });

// Indexes for efficient queries
bookmarkSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Bookmark', bookmarkSchema); 