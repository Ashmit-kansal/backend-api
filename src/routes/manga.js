const express = require('express');
const router = express.Router();
const Manga = require('../models/Manga');
const Chapter = require('../models/Chapter');

// Get all manga with pagination and search
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', genre = '', status = '' } = req.query;
    
    const query = {};
    
    // Search functionality
    if (search) {
      query.$text = { $search: search };
    }
    
    // Genre filter
    if (genre) {
      query.genres = { $in: [genre] };
    }
    
    // Status filter
    if (status) {
      query.status = status;
    }
    
    const skip = (page - 1) * limit;
    
    const manga = await Manga.find(query)
      .select('title coverImage genres status author description stats lastUpdated')
      .sort({ lastUpdated: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Manga.countDocuments(query);
    
    res.json({
      success: true,
      data: manga,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching manga:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch manga'
    });
  }
});

// Get manga by slug
router.get('/slug/:slug', async (req, res) => {
  try {
    const manga = await Manga.findOne({ slug: req.params.slug });
    
    if (!manga) {
      return res.status(404).json({
        success: false,
        message: 'Manga not found'
      });
    }
    
    // Increment views
    manga.stats.views += 1;
    await manga.save();
    
    res.json({
      success: true,
      data: manga
    });
  } catch (error) {
    console.error('Error fetching manga by slug:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch manga by slug'
    });
  }
});

// Get manga by ID
router.get('/:id', async (req, res) => {
  try {
    const manga = await Manga.findById(req.params.id);
    
    if (!manga) {
      return res.status(404).json({
        success: false,
        message: 'Manga not found'
      });
    }
    
    // Increment views
    manga.stats.views += 1;
    await manga.save();
    
    res.json({
      success: true,
      data: manga
    });
  } catch (error) {
    console.error('Error fetching manga by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch manga'
    });
  }
});

// Create new manga
router.post('/', async (req, res) => {
  try {
    const mangaData = req.body;
    const manga = new Manga(mangaData);
    await manga.save();
    
    res.status(201).json({
      success: true,
      data: manga
    });
  } catch (error) {
    console.error('Error creating manga:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create manga'
    });
  }
});

// Update manga
router.put('/:id', async (req, res) => {
  try {
    const manga = await Manga.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!manga) {
      return res.status(404).json({
        success: false,
        message: 'Manga not found'
      });
    }
    
    res.json({
      success: true,
      data: manga
    });
  } catch (error) {
    console.error('Error updating manga:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update manga'
    });
  }
});

// Delete manga
router.delete('/:id', async (req, res) => {
  try {
    const manga = await Manga.findByIdAndDelete(req.params.id);
    
    if (!manga) {
      return res.status(404).json({
        success: false,
        message: 'Manga not found'
      });
    }
    
    // Also delete associated chapters
    await Chapter.deleteMany({ mangaId: req.params.id });
    
    res.json({
      success: true,
      message: 'Manga deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting manga:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete manga'
    });
  }
});

// Get manga by genre
router.get('/genre/:genre', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    
    const manga = await Manga.find({
      genres: { $in: [req.params.genre] }
    })
    .select('title coverImage genres status author description stats lastUpdated')
    .sort({ lastUpdated: -1 })
    .skip(skip)
    .limit(parseInt(limit));
    
    const total = await Manga.countDocuments({
      genres: { $in: [req.params.genre] }
    });
    
    res.json({
      success: true,
      data: manga,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching manga by genre:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch manga by genre'
    });
  }
});

module.exports = router;
