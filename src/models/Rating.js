const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
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
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  review: {
    type: String,
    trim: true,
    maxlength: 1000
  }
}, {
  timestamps: true
});

// Compound index to ensure one rating per user per manga
ratingSchema.index({ userId: 1, mangaId: 1 }, { unique: true });

// Index for efficient queries
ratingSchema.index({ mangaId: 1, rating: 1 });
ratingSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Rating', ratingSchema); 