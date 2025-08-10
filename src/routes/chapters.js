const express = require('express');
const router = express.Router();
const Chapter = require('../models/Chapter');
const Manga = require('../models/Manga');

// Get all chapters for a manga
router.get('/manga/:mangaId', async (req, res) => {
  try {
    const { sortBy = 'chapterNumber', order = 'asc' } = req.query;
    const sortOrder = order === 'desc' ? -1 : 1;
    
    const chapters = await Chapter.find({ mangaId: req.params.mangaId })
      .sort({ [sortBy]: sortOrder })
      .populate('mangaId', 'title');
    
    res.json({
      success: true,
      data: chapters
    });
  } catch (error) {
    console.error('Error fetching chapters:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chapters'
    });
  }
});

// Get chapter by ID
router.get('/:id', async (req, res) => {
  try {
    const chapter = await Chapter.findById(req.params.id)
      .populate('mangaId', 'title');
    
    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: 'Chapter not found'
      });
    }
    
    // Increment views
    chapter.views += 1;
    await chapter.save();
    
    res.json({
      success: true,
      data: chapter
    });
  } catch (error) {
    console.error('Error fetching chapter by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chapter'
    });
  }
});

// Create new chapter
router.post('/', async (req, res) => {
  try {
    const chapterData = req.body;
    const chapter = new Chapter(chapterData);
    await chapter.save();
    
    // Update manga's total chapters count
    await Manga.findByIdAndUpdate(
      chapterData.mangaId,
      { $inc: { 'stats.totalChapters': 1 } }
    );
    
    res.status(201).json({
      success: true,
      data: chapter
    });
  } catch (error) {
    console.error('Error creating chapter:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create chapter'
    });
  }
});

// Update chapter
router.put('/:id', async (req, res) => {
  try {
    const chapter = await Chapter.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: 'Chapter not found'
      });
    }
    
    res.json({
      success: true,
      data: chapter
    });
  } catch (error) {
    console.error('Error updating chapter:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update chapter'
    });
  }
});

// Delete chapter
router.delete('/:id', async (req, res) => {
  try {
    const chapter = await Chapter.findById(req.params.id);
    
    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: 'Chapter not found'
      });
    }
    
    // Update manga's total chapters count
    await Manga.findByIdAndUpdate(
      chapter.mangaId,
      { $inc: { 'stats.totalChapters': -1 } }
    );
    
    await Chapter.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Chapter deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting chapter:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete chapter'
    });
  }
});

// Get latest chapters
router.get('/latest', async (req, res) => {
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

