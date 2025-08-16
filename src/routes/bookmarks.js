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
    console.log('🔍 GET /bookmarks - User object:', req.user);
    // Debug: Check collection names
    console.log('  - Bookmark collection:', Bookmark.collection.name);
    console.log('  - Chapter collection:', Chapter.collection.name);
    // Use aggregation pipeline to get bookmarks with latest chapters and full chapter list
    const bookmarksWithLatestChapters = await Bookmark.aggregate([
      // Match bookmarks for the current user
      { $match: { userId: new mongoose.Types.ObjectId(req.user._id) } },
      // Lookup manga details
      {
        $lookup: {
          from: Manga.collection.name,
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
          from: Chapter.collection.name,
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
          from: Chapter.collection.name,
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
      // Lookup ALL chapters for each manga (for accurate progress calculation)
      {
        $lookup: {
          from: Chapter.collection.name,
          let: { mangaId: '$mangaId' },
          pipeline: [
            { $match: { $expr: { $eq: ['$mangaId', '$$mangaId'] } } },
            { $sort: { chapterNumber: 1 } }, // Sort by chapter number ascending
            { $project: { _id: 1, chapterNumber: 1, title: 1 } }
          ],
          as: 'allChapters'
        }
      },
      // Add reading progress field for sorting
      {
        $addFields: {
          readingProgress: {
            $cond: {
              if: { 
                $and: [
                  { $ne: ['$lastReadChapter', null] },
                  { $ne: ['$latestChapter', null] },
                  { $gt: ['$latestChapter.chapterNumber', 0] }
                ]
              },
              then: {
                $divide: [
                  '$lastReadChapter.chapterNumber',
                  '$latestChapter.chapterNumber'
                ]
              },
              else: 0
            }
          }
        }
      },
      // Sort by reading progress (highest first), then by creation date for ties
      { $sort: { readingProgress: -1, createdAt: -1 } },
      // Project the final structure
      {
        $project: {
          _id: 1,
          userId: 1,
          createdAt: 1,
          updatedAt: 1,
          readingProgress: 1,
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
          },
          allChapters: 1 // Include all chapters for accurate progress calculation
        }
      }
    ]);
    // Debug: Log each bookmark's structure
    bookmarksWithLatestChapters.forEach((bookmark, index) => {
      console.log(`🔍 Bookmark ${index + 1}:`, {
        bookmarkId: bookmark._id,
        mangaId: bookmark.mangaId._id,
        mangaTitle: bookmark.mangaId.title,
        userId: bookmark.userId,
        lastReadChapter: bookmark.lastReadId?.chapterNumber,
        latestChapter: bookmark.latestChapter?.chapterNumber,
        totalChapters: bookmark.allChapters?.length || 0,
        readingProgress: bookmark.readingProgress ? `${(bookmark.readingProgress * 100).toFixed(1)}%` : 'N/A'
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
    console.log('📚 POST /bookmarks - User ID:', req.user._id);
    const { mangaId, lastReadId } = req.body;
    // Validate required fields
    if (!mangaId) {
      console.error('❌ POST /bookmarks - mangaId is missing or null');
      return res.status(400).json({
        success: false,
        message: 'mangaId is required'
      });
    }
    // Validate mangaId format
    if (!mongoose.Types.ObjectId.isValid(mangaId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mangaId format'
      });
    }
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
    // Get the lowest chapter number for this manga to set as lastReadId
    let firstChapter = null;
    try {
      // Debug: Check what chapters exist for this manga
      const allChapters = await Chapter.find({ mangaId: mangaId }).select('_id chapterNumber title').sort({ chapterNumber: 1 });
      firstChapter = await Chapter.findOne({ 
        mangaId: mangaId
      }).sort({ chapterNumber: 1 }).select('_id chapterNumber title');
    } catch (error) {
      console.error('Error finding first chapter:', error);
    }
    const bookmark = new Bookmark({
      mangaId,
      lastReadId: firstChapter ? firstChapter._id : (lastReadId || null), // Use lowest chapter if available, otherwise use provided lastReadId or null
      userId: req.user._id
    });
    console.log('📚 POST /bookmarks - Bookmark object before save:', {
      mangaId: bookmark.mangaId,
      lastReadId: bookmark.lastReadId,
      userId: bookmark.userId,
      firstChapterFound: !!firstChapter,
      firstChapterDetails: firstChapter ? { id: firstChapter._id, number: firstChapter.chapterNumber, title: firstChapter.title } : null
    });
    await bookmark.save();
    // Increment bookmarkCount in manga stats
    await Manga.findByIdAndUpdate(mangaId, {
      $inc: { 'stats.bookmarkCount': 1 }
    });
    // Populate the manga details for the response
    await bookmark.populate('mangaId', 'title coverImage description genres authors slug');
    // Ensure the response has the correct structure
    const responseData = {
      _id: bookmark._id,
      userId: bookmark.userId,
      mangaId: bookmark.mangaId,
      lastReadId: bookmark.lastReadId,
      createdAt: bookmark.createdAt,
      updatedAt: bookmark.updatedAt
    };
    res.status(201).json({
      success: true,
      data: responseData
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
    console.log('📚 PUT /progress/:mangaId - Params:', req.params);
    console.log('📚 PUT /progress/:mangaId - User ID:', req.user._id);
    console.log('📚 PUT /progress/:mangaId - Manga ID from params:', req.params.mangaId);
    const { lastReadId } = req.body;
    // Convert string IDs to ObjectIds for comparison
    const userId = new mongoose.Types.ObjectId(req.user._id);
    const mangaId = new mongoose.Types.ObjectId(req.params.mangaId);
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
    if (!existingBookmark) {
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
    console.log('📚 PUT /progress/:mangaId - Updated lastReadId:', bookmark.lastReadId);
    // Verify the update by fetching the bookmark again
    const verifyBookmark = await Bookmark.findById(bookmark._id).populate('lastReadId');
    console.log('📚 PUT /progress/:mangaId - Verification - lastReadId populated:', verifyBookmark.lastReadId);
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
    res.status(500).json({
      success: false,
      message: 'Failed to remove bookmark'
    });
  }
});
module.exports = router;