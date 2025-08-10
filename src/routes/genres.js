const express = require('express');
const router = express.Router();
const Manga = require('../models/Manga');

// Get all genres
router.get('/', async (req, res) => {
  try {
    const { limit = 50, featured = false } = req.query;
    
    // Get all unique genres from manga
    const manga = await Manga.find({}, 'genres');
    const allGenres = manga.reduce((acc, manga) => {
      if (manga.genres && Array.isArray(manga.genres)) {
        acc.push(...manga.genres);
      }
      return acc;
    }, []);
    
    // Get unique genres and count
    const genreCounts = {};
    allGenres.forEach(genre => {
      genreCounts[genre] = (genreCounts[genre] || 0) + 1;
    });
    
    // Convert to array and sort by count
    const genres = Object.entries(genreCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, parseInt(limit));
    
    res.json({
      success: true,
      data: genres
    });
  } catch (error) {
    console.error('Error fetching genres:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch genres'
    });
  }
});

// Get manga by genre
router.get('/:genre/manga', async (req, res) => {
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

