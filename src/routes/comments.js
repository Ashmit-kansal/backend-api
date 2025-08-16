const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Comment = require('../models/Comment');
const jwt = require('jsonwebtoken'); // Added for extracting user ID from token
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
    const { page = 1, limit = 20, chapterId, sort = 'newest' } = req.query;
    const authHeader = req.headers.authorization;
    let currentUserId = null;
    // Extract user ID from token if provided
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        currentUserId = decoded.id;
      } catch (error) {
        // Token is invalid, but we'll still return comments
      }
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    // Build query based on whether chapterId is provided
    const query = { mangaId };
    if (chapterId) {
      query.chapterId = chapterId;
    }
    // Build sort object based on frontend parameter
    let sortObject = {};
    switch (sort) {
      case 'newest':
        sortObject = { createdAt: -1 };
        break;
      case 'oldest':
        sortObject = { createdAt: 1 };
        break;
      case 'likes':
        sortObject = { 'reactionCounts.likes': -1, createdAt: -1 };
        break;
      default:
        sortObject = { createdAt: -1 };
    }
    const comments = await Comment.find(query)
      .populate('userId', 'username avatar')
      .sort(sortObject)
      .skip(skip)
      .limit(parseInt(limit));
    // Add user reaction information if user is authenticated
    let commentsWithReactions;
    if (currentUserId) {
      // Convert comments to plain objects first so we can add custom properties
      commentsWithReactions = comments.map(comment => {
        const commentObj = comment.toObject();
        // Convert currentUserId to string for comparison
        const currentUserIdStr = currentUserId.toString();
        commentObj.isLikedByUser = commentObj.userReactions?.some(
          reaction => {
            const reactionUserIdStr = reaction.userId.toString();
            return reactionUserIdStr === currentUserIdStr && reaction.type === 'likes';
          }
        ) || false;
        commentObj.isDislikedByUser = commentObj.userReactions?.some(
          reaction => {
            const reactionUserIdStr = reaction.userId.toString();
            return reactionUserIdStr === currentUserIdStr && reaction.type === 'dislikes';
          }
        ) || false;
        return commentObj;
      });
    } else {
      commentsWithReactions = comments.map(comment => comment.toObject());
    }
    const total = await Comment.countDocuments(query);
    res.json({
      success: true,
      data: commentsWithReactions,
      pagination: {
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch comments'
    });
  }
});
// Create a new comment
router.post('/', auth, async (req, res) => {
  try {
    const { mangaId, chapterId, content, containsSpoilers } = req.body;
    const userId = req.user.id;
    // Check if user is banned
    const user = await require('../models/User').findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been banned. You cannot post comments.',
        banReason: user.banReason || 'No reason provided'
      });
    }
    if (!mangaId || !content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Comment content is required'
      });
    }
    const comment = new Comment({
      userId,
      mangaId,
      chapterId: chapterId || null,
      content: content.trim(),
      containsSpoilers: containsSpoilers || false
    });
    await comment.save();
    // Populate user info for response
    await comment.populate('userId', 'username avatar');
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
    const { content, containsSpoilers } = req.body;
    const userId = req.user.id;
    // Check if user is banned
    const user = await require('../models/User').findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been banned. You cannot edit comments.',
        banReason: user.banReason || 'No reason provided'
      });
    }
    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Comment content is required'
      });
    }
    const updateData = { 
      content: content.trim(),
      isEdited: true,
      editedAt: new Date()
    };
    if (containsSpoilers !== undefined) {
      updateData.containsSpoilers = containsSpoilers;
    }
    const comment = await Comment.findOneAndUpdate(
      { _id: id, userId },
      updateData,
      { new: true }
    ).populate('userId', 'username avatar');
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
// Handle comment reactions (like/dislike)
router.post('/:id/reactions', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { reactionType } = req.body;
    const userId = req.user.id;
    // Check if user is banned
    const user = await require('../models/User').findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been banned. You cannot react to comments.',
        banReason: user.banReason || 'No reason provided'
      });
    }
    if (!['likes', 'dislikes'].includes(reactionType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reaction type'
      });
    }
    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }
    // Initialize reaction counts if they don't exist
    if (!comment.reactionCounts) {
      comment.reactionCounts = { likes: 0, dislikes: 0 };
    }
    // Check if user has already reacted
    const existingReaction = comment.userReactions?.find(
      reaction => reaction.userId.toString() === userId
    );
    if (existingReaction) {
      // If same reaction type, remove it (toggle off)
      if (existingReaction.type === reactionType) {
        comment.reactionCounts[reactionType]--;
        comment.userReactions = comment.userReactions.filter(
          reaction => reaction.userId.toString() !== userId
        );
      } else {
        // If different reaction type, change it
        comment.reactionCounts[existingReaction.type]--;
        comment.reactionCounts[reactionType]++;
        existingReaction.type = reactionType;
      }
    } else {
      // Add new reaction
      if (!comment.userReactions) {
        comment.userReactions = [];
      }
      comment.userReactions.push({ userId, type: reactionType });
      comment.reactionCounts[reactionType]++;
    }
    await comment.save();
    res.json({
      success: true,
      message: 'Reaction updated successfully',
      data: {
        reactionCounts: comment.reactionCounts,
        userReactions: comment.userReactions
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update reaction'
    });
  }
});
module.exports = router; 