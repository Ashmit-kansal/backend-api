const mongoose = require('mongoose');

const genreSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  displayName: {
    type: String,
    required: true,
    trim: true
  },
  color: {
    type: String,
    default: '#8b5cf6',
    match: /^#[0-9A-F]{6}$/i
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true
  },
  mangaIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Manga'
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Genre', genreSchema);
