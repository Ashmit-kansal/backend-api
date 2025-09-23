const express = require('express');
const router = express.Router();
const Manga = require('../models/Manga');
const Chapter = require('../models/Chapter');
// Get top-rated manga
router.get('/top-rated', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    // First, let's see what's in the database
    const totalManga = await Manga.countDocuments();
    const mangaWithRatings = await Manga.countDocuments({ 'stats.totalRatings': { $gt: 0 } });
    const mangaWithoutRatings = await Manga.countDocuments({ 'stats.totalRatings': 0 });
    let manga = await Manga.find({ 'stats.totalRatings': { $gt: 0 } })
      .select('_id slug title coverImage genres status authors description stats lastUpdated')
      .sort({ 'stats.averageRating': -1, 'stats.totalRatings': -1 })
      .limit(parseInt(limit));
    // If no manga with ratings, fall back to all manga
    if (manga.length === 0) {
      manga = await Manga.find()
        .select('_id slug title coverImage genres status authors description stats lastUpdated')
        .sort({ lastUpdated: -1 })
        .limit(parseInt(limit));
    }
    if (manga.length > 0) {
      // console.log('🔍 First manga sample:', {
      //   title: manga[0].title,
      //   rating: manga[0].stats?.averageRating,
      //   totalRatings: manga[0].stats?.totalRatings
      // });
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
      .select('_id slug title coverImage genres status authors description stats lastUpdated')
      .sort({ lastUpdated: -1 })
      .limit(parseInt(limit));
    res.json({
      success: true,
      data: manga
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent manga'
    });
  }
});
// Test endpoint for pagination debugging
router.get('/test-pagination', async (req, res) => {
  try {
    const { limit = 5, page = 1 } = req.query;
    const parsedLimit = parseInt(limit);
    const parsedPage = parseInt(page);
    const skip = (parsedPage - 1) * parsedLimit;
    // Simple find with skip and limit
    const manga = await Manga.find()
      .sort({ lastUpdated: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .select('title lastUpdated');
    const total = await Manga.countDocuments();
    res.json({
      success: true,
      data: manga,
      pagination: {
        currentPage: parsedPage,
        totalPages: Math.ceil(total / parsedLimit),
        totalItems: total,
        itemsPerPage: parsedLimit
      }
    });
  } catch (error) {
    console.error('Error in test pagination:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test pagination'
    });
  }
});
// Get recent manga with last 3 chapters using aggregation
router.get('/recent-with-chapters', async (req, res) => {
  try {
    const { limit = 15, page = 1 } = req.query;
    const parsedLimit = parseInt(limit);
    const parsedPage = parseInt(page);
    const skip = (parsedPage - 1) * parsedLimit;
    // console.log('🔍 Parsed parameters:', { limit: parsedLimit, page: parsedPage, skip });
    // Use aggregation pipeline to get manga with their last 3 chapters
    // First, let's test with a simple approach to see if pagination works
    const simpleManga = await Manga.find()
      .sort({ lastUpdated: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .select('title lastUpdated');
    // Now try the full aggregation pipeline
    const mangaWithChapters = await Manga.aggregate([
      // Stage 1: Sort manga by lastUpdated (most recent first)
      { $sort: { lastUpdated: -1 } },
      // Stage 2: Skip for pagination
      { $skip: skip },
      // Stage 3: Limit results
      { $limit: parsedLimit },
      // Stage 4: Lookup only the last 3 chapters for each manga
      {
        $lookup: {
          from: 'chapters',
          let: { mangaId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$mangaId', '$$mangaId'] } } },
            { $sort: { chapterNumber: -1 } },
            { $limit: 3 },
            { $project: {
                _id: 1,
                chapterNumber: 1,
                title: 1,
                createdAt: 1,
                scrapedAt: 1,
                lastUpdated: 1,
                views: 1
              }
            }
          ],
          as: 'chapters'
        }
      },
      // Stage 5: Project only the fields we need
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
          chapters: 1
        }
      }
    ])
    // console.log(`🔍 Aggregation result: expected ${parsedLimit}, got ${mangaWithChapters.length}`);
    // Get total count for pagination
    const total = await Manga.countDocuments();
    // console.log(`📊 Pagination details: total=${total}, limit=${parsedLimit}, page=${parsedPage}, skip=${skip}`);
    res.json({
      success: true,
      data: mangaWithChapters,
      pagination: {
        currentPage: parsedPage,
        totalPages: Math.ceil(total / parsedLimit),
        totalItems: total,
        itemsPerPage: parsedLimit
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
      .sort({ scrapedAt: -1 })
      .limit(parseInt(limit))
      .populate('mangaId', 'title coverImage');
    res.json({
      success: true,
      data: chapters
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch latest chapters'
    });
  }
});
module.exports = router;
