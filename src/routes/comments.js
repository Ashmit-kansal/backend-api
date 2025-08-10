const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Comment = require('../models/Comment');

// Get all comments for the authenticated user
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const comments = await Comment.find({ userId })
      .populate('mangaId', 'title coverImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Comment.countDocuments({ userId });
    
    res.json({
      success: true,
      data: comments,
      pagination: {
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        total
      }
    });
  } catch (error) {
    console.error('Error fetching user comments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch comments'
    });
  }
});

// Get comments for a specific manga
router.get('/manga/:mangaId', async (req, res) => {
  try {
    const { mangaId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const comments = await Comment.find({ mangaId })
      .populate('userId', 'username profile.displayName profile.avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Comment.countDocuments({ mangaId });
    
    res.json({
      success: true,
      data: comments,
      pagination: {
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        total
      }
    });
  } catch (error) {
    console.error('Error fetching manga comments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch comments'
    });
  }
});

// Create a new comment
router.post('/', auth, async (req, res) => {
  try {
    const { mangaId, content } = req.body;
    const userId = req.user.id;

    if (!mangaId || !content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Comment content is required'
      });
    }

    const comment = new Comment({
      userId,
      mangaId,
      content: content.trim()
    });

    await comment.save();

    // Populate user info for response
    await comment.populate('userId', 'username profile.displayName profile.avatar');

    res.json({
      success: true,
      data: comment,
      message: 'Comment created successfully'
    });
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create comment'
    });
  }
});

// Update a comment
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Comment content is required'
      });
    }

    const comment = await Comment.findOneAndUpdate(
      { _id: id, userId },
      { content: content.trim() },
      { new: true }
    ).populate('userId', 'username profile.displayName profile.avatar');

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found or unauthorized'
      });
    }

    res.json({
      success: true,
      data: comment,
      message: 'Comment updated successfully'
    });
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update comment'
    });
  }
});

// Delete a comment
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const comment = await Comment.findOneAndDelete({ _id: id, userId });

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found or unauthorized'
      });
    }

    res.json({
      success: true,
      message: 'Comment deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete comment'
    });
  }
});

module.exports = router; 