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
    
    const bookmarks = await Bookmark.find({ userId: req.user._id })
      .populate('mangaId', 'title coverImage description genres status authors')
      .populate('lastReadId', 'chapterNumber title')
      .sort({ createdAt: -1 });
    
    console.log('🔍 GET /bookmarks - Found bookmarks:', bookmarks);
    console.log('🔍 GET /bookmarks - Bookmark count:', bookmarks.length);
    
    // Debug: Log each bookmark's mangaId for comparison
    bookmarks.forEach((bookmark, index) => {
      console.log(`🔍 Bookmark ${index + 1}:`, {
        bookmarkId: bookmark._id,
        mangaId: bookmark.mangaId._id,
        mangaTitle: bookmark.mangaId.title,
        userId: bookmark.userId
      });
    });
    
    res.json({
      success: true,
      data: bookmarks
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
    
    const bookmark = new Bookmark({
      mangaId,
      lastReadId: lastReadId,
      userId: req.user._id
    });
    
    console.log('📚 POST /bookmarks - Bookmark object before save:', bookmark);
    
    await bookmark.save();
    
    console.log('📚 POST /bookmarks - Bookmark saved successfully:', bookmark);
    
    // Increment bookmarkCount in manga stats
    await Manga.findByIdAndUpdate(mangaId, {
      $inc: { 'stats.bookmarkCount': 1 }
    });
    
    // Populate the manga details for the response
    await bookmark.populate('mangaId', 'title coverImage description genres status authors');
    
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
