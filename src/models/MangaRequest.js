const mongoose = require('mongoose');

const mangaRequestSchema = new mongoose.Schema({
  mangaTitle: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  }
}, {
  timestamps: true
});

// Simple index for efficient querying
mangaRequestSchema.index({ createdAt: -1 });

const MangaRequest = mongoose.model('MangaRequest', mangaRequestSchema);

module.exports = MangaRequest;
