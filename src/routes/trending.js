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
      .select('title coverImage genres status author description stats lastUpdated')
      .sort({ 'stats.averageRating': -1, 'stats.totalRatings': -1 })
      .limit(parseInt(limit));
    
    // If no manga with ratings, fall back to all manga
    if (manga.length === 0) {
      console.log('🔍 No manga with ratings found, falling back to all manga');
      manga = await Manga.find()
        .select('title coverImage genres status author description stats lastUpdated')
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
      .select('title coverImage genres status author description stats lastUpdated')
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

// Get recent manga with last 3 chapters using aggregation
router.get('/recent-with-chapters', async (req, res) => {
  try {
    const { limit = 15, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    console.log('🔍 Fetching recent manga with chapters using aggregation:', { limit, page, skip });
    
    // Use aggregation pipeline to get manga with their last 3 chapters
    const mangaWithChapters = await Manga.aggregate([
      // Stage 1: Sort manga by lastUpdated (most recent first)
      {
        $sort: { lastUpdated: -1 }
      },
      // Stage 2: Skip for pagination
      {
        $skip: skip
      },
      // Stage 3: Limit results
      {
        $limit: parseInt(limit)
      },
      // Stage 4: Lookup chapters for each manga
      {
        $lookup: {
          from: 'chapters',
          localField: '_id',
          foreignField: 'mangaId',
          as: 'chapters'
        }
      },
      // Stage 5: Sort chapters by chapterNumber and limit to 3
      {
        $addFields: {
          chapters: {
            $slice: [
              {
                $sortArray: {
                  input: '$chapters',
                  sortBy: { chapterNumber: -1 }
                }
              },
              3
            ]
          }
        }
      },
      // Stage 6: Project only the fields we need
      {
        $project: {
          _id: 1,
          title: 1,
          coverImage: 1,
          genres: 1,
          status: 1,
          author: 1,
          description: 1,
          stats: 1,
          lastUpdated: 1,
          slug: 1,
          chapters: {
            _id: 1,
            chapterNumber: 1,
            title: 1,
            createdAt: 1,
            publishedAt: 1,
            views: 1
          }
        }
      }
    ]);
    
    // Get total count for pagination
    const total = await Manga.countDocuments();
    
    console.log(`✅ Successfully fetched ${mangaWithChapters.length} manga with chapters`);
    
    res.json({
      success: true,
      data: mangaWithChapters,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching recent manga with chapters:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent manga with chapters'
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
      .populate('mangaId', 'title coverImage');
    
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

