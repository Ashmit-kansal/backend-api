const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const MangaRequest = require('../models/MangaRequest');
// Submit a new manga request
router.post('/', auth, async (req, res) => {
  try {
    const { mangaTitle, description } = req.body;
    // Basic validation
    if (!mangaTitle || !description) {
      return res.status(400).json({
        success: false,
        message: 'Manga title and description are required'
      });
    }
    // Create the manga request
    const mangaRequest = new MangaRequest({
      userId: req.user.id,
      requester: req.user.id,
      mangaTitle,
      description
    });
    await mangaRequest.save();
    res.status(201).json({
      success: true,
      message: 'Manga request submitted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to submit manga request'
    });
  }
});
module.exports = router;