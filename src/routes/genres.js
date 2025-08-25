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
// Get specific genre by slug
router.get('/:slug', async (req, res) => {
  try {
    // Try exact slug match first
    let genre = await Genre.findOne({ 
      slug: req.params.slug,
      isActive: true 
    }).select('name displayName color slug mangaIds isActive createdAt updatedAt');
    
    // If not found, try case-insensitive slug match
    if (!genre) {
      genre = await Genre.findOne({ 
        slug: { $regex: new RegExp(`^${req.params.slug}$`, 'i') },
        isActive: true 
      }).select('name displayName color slug mangaIds isActive createdAt updatedAt');
    }
    
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

// Get manga by genre - MUST come after /:slug to avoid route conflicts
router.get('/:genre/manga', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    const genreName = req.params.genre;
    
    // Try exact match first
    let manga = await Manga.find({
      genres: { $in: [genreName] }
    })
    .select('_id slug title coverImage genres status authors description stats lastUpdated')
    .sort({ lastUpdated: -1 })
    .skip(skip)
    .limit(parseInt(limit));
    
    let total = await Manga.countDocuments({
      genres: { $in: [genreName] }
    });
    
    // If no results, try case-insensitive match
    if (total === 0) {
      // Get all manga to find the exact case of the genre name
      const allManga = await Manga.find({}, 'genres');
      
      // Find the exact genre name from manga documents (case-insensitive)
      let exactGenreName = null;
      for (const mangaDoc of allManga) {
        if (mangaDoc.genres && Array.isArray(mangaDoc.genres)) {
          const foundGenre = mangaDoc.genres.find(g => g.toLowerCase() === genreName.toLowerCase());
          if (foundGenre) {
            exactGenreName = foundGenre;
            break;
          }
        }
      }
      
      if (exactGenreName) {
        console.log(`Genre case correction: "${genreName}" -> "${exactGenreName}"`);
        // Use the exact genre name from the manga documents (with correct case)
        manga = await Manga.find({
          genres: { $in: [exactGenreName] }
        })
        .select('_id slug title coverImage genres status authors description stats lastUpdated')
        .sort({ lastUpdated: -1 })
        .skip(skip)
        .limit(parseInt(limit));
        
        total = await Manga.countDocuments({
          genres: { $in: [exactGenreName] }
        });
      } else {
        console.log(`No case-insensitive match found for genre: "${genreName}"`);
      }
    }
    
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
