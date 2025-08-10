const mongoose = require('mongoose');

const chapterSchema = new mongoose.Schema({
  mangaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Manga',
    required: true
  },
  chapterNumber: {
    type: Number,
    required: true
  },
  title: {
    type: String,
    default: ''
  },
  name: {
    type: String,
    default: ''
  },
  pages: [{
    pageNumber: {
      type: Number,
      required: true
    },
    imageUrl: {
      type: String,
      required: true
    }
  }],
  publishedAt: {
    type: Date,
    default: Date.now
  },
  views: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Compound index for manga and chapter number
chapterSchema.index({ mangaId: 1, chapterNumber: 1 }, { unique: true });

module.exports = mongoose.model('Chapter', chapterSchema);

