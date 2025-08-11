const express = require('express');
const router = express.Router();
const Bookmark = require('../models/Bookmark');
const Manga = require('../models/Manga');
const Chapter = require('../models/Chapter');
const auth = require('../middleware/auth');
const mongoose = require('mongoose');

// Debug middleware to log all requests to bookmarks router
router.use((req, res, next) => {
  console.log('📚 Bookmarks Router - Request received:', {
    method: req.method,
    url: req.url,
    path: req.path,
    params: req.params,
    body: req.body,
    user: req.user ? req.user._id : 'No user'
  });
  next();
});

// Apply auth middleware to all bookmark routes
router.use(auth);

// Get user's bookmarks
router.get('/', async (req, res) => {
  try {
    console.log('🔍 GET /bookmarks - User ID:', req.user._id);
    console.log('🔍 GET /bookmarks - User object:', req.user);
    
    // Use aggregation pipeline to get bookmarks with latest chapters in a single query
    const bookmarksWithLatestChapters = await Bookmark.aggregate([
      // Match bookmarks for the current user
      { $match: { userId: new mongoose.Types.ObjectId(req.user._id) } },
      
      // Sort by creation date (newest first)
      { $sort: { createdAt: -1 } },
      
      // Lookup manga details
      {
        $lookup: {
          from: 'mangas',
          localField: 'mangaId',
          foreignField: '_id',
          as: 'mangaDetails'
        }
      },
      
      // Unwind manga details array
      { $unwind: '$mangaDetails' },
      
      // Lookup last read chapter details
      {
        $lookup: {
          from: 'chapters',
          localField: 'lastReadId',
          foreignField: '_id',
          as: 'lastReadChapter'
        }
      },
      
      // Unwind last read chapter array (optional field)
      { $unwind: { path: '$lastReadChapter', preserveNullAndEmptyArrays: true } },
      
      // Lookup latest chapter for each manga
      {
        $lookup: {
          from: 'chapters',
          let: { mangaId: '$mangaId' },
          pipeline: [
            { $match: { $expr: { $eq: ['$mangaId', '$$mangaId'] } } },
            { $sort: { chapterNumber: -1 } },
            { $limit: 1 },
            { $project: { _id: 1, chapterNumber: 1, title: 1 } }
          ],
          as: 'latestChapter'
        }
      },
      
      // Unwind latest chapter array
      { $unwind: { path: '$latestChapter', preserveNullAndEmptyArrays: true } },
      
      // Project the final structure
      {
        $project: {
          _id: 1,
          userId: 1,
          createdAt: 1,
          updatedAt: 1,
          mangaId: {
            _id: '$mangaDetails._id',
            title: '$mangaDetails.title',
            coverImage: '$mangaDetails.coverImage',
            description: '$mangaDetails.description',
            genres: '$mangaDetails.genres',
            status: '$mangaDetails.status',
            authors: '$mangaDetails.authors',
            slug: '$mangaDetails.slug'
          },
          lastReadId: {
            _id: '$lastReadChapter._id',
            chapterNumber: '$lastReadChapter.chapterNumber',
            title: '$lastReadChapter.title'
          },
          latestChapter: {
            _id: '$latestChapter._id',
            chapterNumber: '$latestChapter.chapterNumber',
            title: '$latestChapter.title'
          }
        }
      }
    ]);
    
    console.log('🔍 GET /bookmarks - Found bookmarks:', bookmarksWithLatestChapters);
    console.log('🔍 GET /bookmarks - Bookmark count:', bookmarksWithLatestChapters.length);
    
    // Debug: Log each bookmark's structure
    bookmarksWithLatestChapters.forEach((bookmark, index) => {
      console.log(`🔍 Bookmark ${index + 1}:`, {
        bookmarkId: bookmark._id,
        mangaId: bookmark.mangaId._id,
        mangaTitle: bookmark.mangaId.title,
        userId: bookmark.userId,
        lastReadChapter: bookmark.lastReadId?.chapterNumber,
        latestChapter: bookmark.latestChapter?.chapterNumber
      });
    });
    
    res.json({
      success: true,
      data: bookmarksWithLatestChapters
    });
  } catch (error) {
    console.error('Error fetching bookmarks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookmarks'
    });
  }
});

// Add bookmark
router.post('/', async (req, res) => {
  try {
    console.log('📚 POST /bookmarks - Request body:', req.body);
    console.log('📚 POST /bookmarks - User ID:', req.user._id);
    
    const { mangaId, lastReadId } = req.body;
    
    console.log('📚 POST /bookmarks - Extracted data:', { mangaId, lastReadId });
    
    // Check if bookmark already exists
    const existingBookmark = await Bookmark.findOne({ 
      userId: req.user._id, 
      mangaId: mangaId 
    });
    
    if (existingBookmark) {
      return res.status(400).json({
        success: false,
        message: 'Bookmark already exists'
      });
    }
    
    // Get chapter 1 for this manga to set as lastReadId
    let chapter1 = null;
    try {
      chapter1 = await Chapter.findOne({ 
        mangaId: mangaId,
        chapterNumber: 1 
      }).select('_id chapterNumber title');
    } catch (error) {
      console.error('Error finding chapter 1:', error);
    }
    
    const bookmark = new Bookmark({
      mangaId,
      lastReadId: chapter1 ? chapter1._id : (lastReadId || null), // Use chapter 1 if available, otherwise use provided lastReadId or null
      userId: req.user._id
    });
    
    console.log('📚 POST /bookmarks - Bookmark object before save:', {
      mangaId: bookmark.mangaId,
      lastReadId: bookmark.lastReadId,
      userId: bookmark.userId,
      chapter1Found: !!chapter1,
      chapter1Details: chapter1 ? { id: chapter1._id, number: chapter1.chapterNumber, title: chapter1.title } : null
    });
    
    await bookmark.save();
    
    console.log('📚 POST /bookmarks - Bookmark saved successfully:', bookmark);
    
    // Increment bookmarkCount in manga stats
    await Manga.findByIdAndUpdate(mangaId, {
      $inc: { 'stats.bookmarkCount': 1 }
    });
    
    // Populate the manga details for the response
    await bookmark.populate('mangaId', 'title coverImage description genres');
    
    res.status(201).json({
      success: true,
      data: bookmark
    });
  } catch (error) {
    console.error('Error creating bookmark:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create bookmark'
    });
  }
});

// Update bookmark progress
router.put('/:mangaId/progress', async (req, res) => {
  try {
    console.log('📚 PUT /progress/:mangaId - Request received');
    console.log('📚 PUT /progress/:mangaId - Params:', req.params);
    console.log('📚 PUT /progress/:mangaId - Body:', req.body);
    console.log('📚 PUT /progress/:mangaId - User ID:', req.user._id);
    console.log('📚 PUT /progress/:mangaId - User ID type:', typeof req.user._id);
    console.log('📚 PUT /progress/:mangaId - Manga ID from params:', req.params.mangaId);
    console.log('📚 PUT /progress/:mangaId - Manga ID type:', typeof req.params.mangaId);
    
    const { lastReadId } = req.body;
    
    // Convert string IDs to ObjectIds for comparison
    const userId = new mongoose.Types.ObjectId(req.user._id);
    const mangaId = new mongoose.Types.ObjectId(req.params.mangaId);
    
    console.log('📚 PUT /progress/:mangaId - Converted User ID:', userId);
    console.log('📚 PUT /progress/:mangaId - Converted Manga ID:', mangaId);
    
    console.log('📚 PUT /progress/:mangaId - Looking for bookmark with criteria:', {
      userId: userId,
      mangaId: mangaId
    });
    
    // First, let's check if the bookmark exists at all
    const existingBookmark = await Bookmark.findOne({
      userId: userId,
      mangaId: mangaId
    });
    
    console.log('📚 PUT /progress/:mangaId - Existing bookmark found:', existingBookmark);
    
    if (!existingBookmark) {
      console.log('📚 PUT /progress/:mangaId - No bookmark found with findOne, returning 404');
      return res.status(404).json({
        success: false,
        message: 'Bookmark not found'
      });
    }
    
    // Now update the bookmark
    const bookmark = await Bookmark.findOneAndUpdate(
      { userId: userId, mangaId: mangaId },
      { lastReadId: lastReadId },
      { new: true }
    );
    
    console.log('📚 PUT /progress/:mangaId - Bookmark updated successfully:', bookmark);
    
    res.json({
      success: true,
      data: bookmark
    });
  } catch (error) {
    console.error('📚 PUT /progress/:mangaId - Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Remove bookmark
router.delete('/:mangaId', async (req, res) => {
  try {
    const bookmark = await Bookmark.findOneAndDelete({
      userId: req.user._id,
      mangaId: req.params.mangaId
    });
    
    if (!bookmark) {
      return res.status(404).json({
        success: false,
        message: 'Bookmark not found'
      });
    }
    
    // Decrement bookmarkCount in manga stats
    await Manga.findByIdAndUpdate(req.params.mangaId, {
      $inc: { 'stats.bookmarkCount': -1 }
    });
    
    res.json({
      success: true,
      message: 'Bookmark removed successfully'
    });
  } catch (error) {
    console.error('Error removing bookmark:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove bookmark'
    });
  }
});

module.exports = router;
