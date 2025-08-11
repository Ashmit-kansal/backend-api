const express = require('express');
const router = express.Router();
const Manga = require('../models/Manga');
const Chapter = require('../models/Chapter');

// Get top-rated manga
router.get('/top-rated', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    console.log('🔍 Fetching top-rated manga with limit:', limit);
    
    // First, let's see what's in the database
    const totalManga = await Manga.countDocuments();
    const mangaWithRatings = await Manga.countDocuments({ 'stats.totalRatings': { $gt: 0 } });
    const mangaWithoutRatings = await Manga.countDocuments({ 'stats.totalRatings': 0 });
    
    console.log('🔍 Database stats:', { totalManga, mangaWithRatings, mangaWithoutRatings });
    
    let manga = await Manga.find({ 'stats.totalRatings': { $gt: 0 } })
      .select('title coverImage genres status author description stats lastUpdated slug')
      .sort({ 'stats.averageRating': -1, 'stats.totalRatings': -1 })
      .limit(parseInt(limit));
    
    // If no manga with ratings, fall back to all manga
    if (manga.length === 0) {
      console.log('🔍 No manga with ratings found, falling back to all manga');
      manga = await Manga.find()
        .select('title coverImage genres status author description stats lastUpdated slug')
        .sort({ lastUpdated: -1 })
        .limit(parseInt(limit));
    }
    
    console.log('🔍 Found manga with ratings:', manga.length);
    if (manga.length > 0) {
      console.log('🔍 First manga sample:', {
        title: manga[0].title,
        rating: manga[0].stats?.averageRating,
        totalRatings: manga[0].stats?.totalRatings
      });
    }
    
    res.json({
      success: true,
      data: manga
    });
  } catch (error) {
    console.error('Error fetching top-rated manga:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch top-rated manga'
    });
  }
});

// Get recent manga
router.get('/recent', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    const manga = await Manga.find()
      .select('title coverImage genres status author description stats lastUpdated slug')
      .sort({ lastUpdated: -1 })
      .limit(parseInt(limit));
    
    res.json({
      success: true,
      data: manga
    });
  } catch (error) {
    console.error('Error fetching recent manga:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent manga'
    });
  }
});

// Get latest chapters
router.get('/latest-chapters', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const chapters = await Chapter.find()
      .sort({ publishedAt: -1 })
      .limit(parseInt(limit))
      .populate('mangaId', 'title coverImage slug');
    
    res.json({
      success: true,
      data: chapters
    });
  } catch (error) {
    console.error('Error fetching latest chapters:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch latest chapters'
    });
  }
});

module.exports = router;

