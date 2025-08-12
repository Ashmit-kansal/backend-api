const mongoose = require('mongoose');

const mangaSchema = new mongoose.Schema({
  slug: {
    type: String,
    unique: true,
    index: true,
    trim: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: 'No description available.'
  },
  coverImage: {
    type: String,
    required: true
  },
  genres: [{
    type: String,
    trim: true
  }],
  status: {
    type: String,
    enum: ['Ongoing', 'Completed', 'Hiatus', 'Cancelled'],
    default: 'Ongoing'
  },
  publicationYear: {
    type: Number
  },
  alternativeTitles: [{
    type: String,
    trim: true
  }],
  stats: {
    views: {
      type: Number,
      default: 0
    },
    totalChapters: {
      type: Number,
      default: 0
    },
    averageRating: {
      type: Number,
      default: 0
    },
    totalRatings: {
      type: Number,
      default: 0
    },
    bookmarkCount: {
      type: Number,
      default: 0
    }
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for better search performance
mangaSchema.index({ 
  title: 'text', 
  genres: 'text',
  alternativeTitles: 'text',
  description: 'text'
});

// Helper to create URL-friendly slugs
function generateSlugFromTitle(title) {
  return String(title)
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Ensure slug is present and unique before saving
mangaSchema.pre('save', async function(next) {
  if (!this.isModified('title') && this.slug) return next();

  const baseSlug = this.slug || generateSlugFromTitle(this.title);
  let candidate = baseSlug;
  let counter = 1;

  // Ensure uniqueness by appending counter if necessary
  while (await mongoose.models.Manga.findOne({ slug: candidate, _id: { $ne: this._id } })) {
    candidate = `${baseSlug}-${counter++}`;
  }
  this.slug = candidate;
  next();
});

module.exports = mongoose.model('Manga', mangaSchema);
