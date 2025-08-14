const express = require('express');
const router = express.Router();
const Manga = require('../models/Manga');
const Genre = require('../models/Genre');

// Get all genres
router.get('/', async (req, res) => {
  try {
    const { limit = 50, featured = false } = req.query;
    
    // First try to get genres from the Genre model
    let genres = await Genre.find({ isActive: true })
      .select('name displayName color slug mangaIds isActive')
      .sort({ displayName: 1 })
      .limit(parseInt(limit));
    
    // If no genres found in Genre model, fallback to extracting from Manga
    if (!genres || genres.length === 0) {
      console.log('No genres found in Genre model, falling back to Manga extraction');
      
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
      genres = Object.entries(genreCounts)
        .map(([name, count]) => ({ 
          name, 
          displayName: name.charAt(0).toUpperCase() + name.slice(1),
          count,
          color: '#8b5cf6' // Default color for fallback genres
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, parseInt(limit));
    } else {
      // Transform Genre model data to include count
      genres = genres.map(genre => ({
        name: genre.name,
        displayName: genre.displayName,
        color: genre.color,
        slug: genre.slug,
        count: genre.mangaIds ? genre.mangaIds.length : 0,
        isActive: genre.isActive
      }));
      
      // Sort by count if not already sorted
      genres.sort((a, b) => b.count - a.count);
    }
    
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
    .select('_id slug title coverImage genres status authors description stats lastUpdated')
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

// Get specific genre by slug
router.get('/:slug', async (req, res) => {
  try {
    const genre = await Genre.findOne({ 
      slug: req.params.slug,
      isActive: true 
    }).select('name displayName color slug mangaIds isActive createdAt updatedAt');
    
    if (!genre) {
      return res.status(404).json({
        success: false,
        message: 'Genre not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        name: genre.name,
        displayName: genre.displayName,
        color: genre.color,
        slug: genre.slug,
        mangaCount: genre.mangaIds ? genre.mangaIds.length : 0,
        isActive: genre.isActive,
        createdAt: genre.createdAt,
        updatedAt: genre.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching genre:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch genre'
    });
  }
});

module.exports = router;

