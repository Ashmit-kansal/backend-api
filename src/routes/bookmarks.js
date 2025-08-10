const express = require('express');
const router = express.Router();
const Bookmark = require('../models/Bookmark');
const Manga = require('../models/Manga');
const Chapter = require('../models/Chapter');
const auth = require('../middleware/auth');

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
    const { mangaId, lastReadChapter } = req.body;
    
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
      lastReadId: lastReadChapter,
      userId: req.user._id
    });
    
    await bookmark.save();
    
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
router.put('/progress/:mangaId', async (req, res) => {
  try {
    const { lastReadId } = req.body;
    
    const bookmark = await Bookmark.findOneAndUpdate(
      { userId: req.user._id, mangaId: req.params.mangaId },
      { lastReadId: lastReadId },
      { new: true }
    );
    
    if (!bookmark) {
      return res.status(404).json({
        success: false,
        message: 'Bookmark not found'
      });
    }
    
    res.json({
      success: true,
      data: bookmark
    });
  } catch (error) {
    console.error('Error updating bookmark progress:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update bookmark progress'
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
