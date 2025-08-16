const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ErrorReport = require('../models/ErrorReport');
// Submit a new error report
router.post('/', auth, async (req, res) => {
  try {
    console.log('🔍 User ID from auth:', req.user.id);
    const { type, commentId, mangaId, chapterNumber, reason, description } = req.body;
    const userId = req.user.id;
    console.log('🔍 Type check - type === "comment":', type === 'comment');
    console.log('🔍 Type check - typeof type:', typeof type);
    console.log('🔍 Type check - type length:', type ? type.length : 'undefined');
    console.log('🔍 ChapterNumber details:', {
      value: chapterNumber,
      type: typeof chapterNumber,
      isNull: chapterNumber === null,
      isUndefined: chapterNumber === undefined,
      stringValue: chapterNumber ? chapterNumber.toString() : 'null/undefined'
    });
    // Validate required fields
    if (!type || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Type and reason are required'
      });
    }
    // Validate type
    if (!['comment', 'chapter'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report type. Must be "comment" or "chapter"'
      });
    }
    // Validate reason
    if (!['spam', 'inappropriate', 'harassment', 'broken', 'other'].includes(reason)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report reason'
      });
    }
    // Validate based on type
    // Normalize the type field to handle potential whitespace or case issues
    const normalizedType = type ? type.toString().trim().toLowerCase() : '';
    if (normalizedType === 'comment') {
      if (!commentId) {
        return res.status(400).json({
          success: false,
          message: 'Comment ID is required for comment reports'
        });
      }
      if (!mangaId) {
        return res.status(400).json({
          success: false,
          message: 'Manga ID is required for comment reports'
        });
      }
      // chapterId is optional for comment reports (can be null if comment is on manga page)
    } else if (normalizedType === 'chapter') {
      if (!mangaId || !chapterNumber) {
        return res.status(400).json({
          success: false,
          message: 'Manga ID and Chapter Number are required for chapter reports'
        });
      }
    }
    // Check if user already reported this item
    let existingReport;
    if (normalizedType === 'comment') {
      existingReport = await ErrorReport.findOne({
        type: 'comment',
        commentId,
        userId,
        status: { $in: ['pending', 'reviewed'] }
      });
    } else if (normalizedType === 'chapter') {
                   existingReport = await ErrorReport.findOne({
               type: 'chapter',
               mangaId,
               chapterNumber,
               userId,
               status: { $in: ['pending', 'reviewed'] }
             });
    }
    if (existingReport) {
      return res.status(400).json({
        success: false,
        message: 'You have already reported this item'
      });
    }
    // Get the defaulterId (user being reported against)
    let defaulterId = null;
    if (normalizedType === 'comment') {
      // For comment reports, get the comment author
      try {
        const Comment = require('../models/Comment');
        const comment = await Comment.findById(commentId);
        if (!comment) {
          return res.status(404).json({
            success: false,
            message: 'Comment not found'
          });
        }
        defaulterId = comment.userId; // Comment model uses 'userId' field
        console.log('🔍 Comment details:', {
          mangaId: comment.mangaId,
          chapterId: comment.chapterId,
          mangaIdMatch: comment.mangaId.toString() === mangaId,
          hasChapterId: !!comment.chapterId
        });
        // Also verify that the comment belongs to the reported manga/chapter
        if (comment.mangaId.toString() !== mangaId) {
          return res.status(400).json({
            success: false,
            message: 'Comment does not belong to the specified manga'
          });
        }
        // For comment reports, we need to check if the comment's chapterId matches the reported chapter
        // If chapterNumber is provided, we need to look up the chapter to get its number
        console.log('🔍 Chapter validation check:', {
          shouldValidate: !!(chapterNumber && comment.chapterId),
          chapterNumber,
          commentChapterId: comment.chapterId,
          chapterNumberTruthy: !!chapterNumber,
          commentChapterIdTruthy: !!comment.chapterId
        });
        if (chapterNumber && comment.chapterId) {
          try {
            const Chapter = require('../models/Chapter');
            const chapter = await Chapter.findById(comment.chapterId);
            if (chapter) {
              // Convert both to strings for comparison to handle number vs string mismatches
              const commentChapterNumber = chapter.chapterNumber.toString();
              const reportedChapterNumber = chapterNumber.toString();
              console.log('🔍 Chapter validation:', {
                commentChapterNumber,
                reportedChapterNumber,
                match: commentChapterNumber === reportedChapterNumber
              });
              if (commentChapterNumber !== reportedChapterNumber) {
                return res.status(400).json({
                  success: false,
                  message: 'Comment does not belong to the specified chapter'
                });
              }
            }
          } catch (chapterError) {
            console.error('❌ Error looking up chapter for validation:', chapterError);
            // Don't fail the report if we can't validate the chapter
          }
        }
      } catch (commentError) {
        return res.status(500).json({
          success: false,
          message: 'Error looking up comment'
        });
      }
    }
    // For chapter reports, defaulterId will remain null since we can't determine the author
    // Create the error report
    console.log('🔍 Creating ErrorReport with data:', {
      type: normalizedType,
      userId,
      commentId,
      mangaId,
      chapterNumber,
      defaulterId,
      reason,
      description: description || ''
    });
    // Additional debugging for chapter reports
    if (normalizedType === 'chapter') {
      console.log('🔍 Chapter report details:', {
        mangaId,
        chapterNumber,
        mangaIdType: typeof mangaId,
        chapterNumberType: typeof chapterNumber,
        mangaIdTruthy: !!mangaId,
        chapterNumberTruthy: !!chapterNumber
      });
    }
    const errorReport = new ErrorReport({
      type: normalizedType,
      userId,
      commentId: normalizedType === 'comment' ? commentId : undefined,
      mangaId: mangaId, // Always include mangaId for both comment and chapter reports
      chapterNumber: chapterNumber, // Always include chapterNumber for both comment and chapter reports
      defaulterId,
      reason,
      description: description || ''
    });
    console.log('🔍 About to save ErrorReport...');
    await errorReport.save();
    res.status(201).json({
      success: true,
      message: 'Report submitted successfully',
      data: {
        id: errorReport._id,
        type: errorReport.type,
        status: errorReport.status,
        createdAt: errorReport.createdAt
      }
    });
  } catch (error) {
    console.error('❌ Error submitting error report:', error);
    console.error('❌ Error name:', error.name);
    console.error('❌ Error stack:', error.stack);
    // If it's a validation error, provide more details
    if (error.name === 'ValidationError') {
      console.error('❌ Validation errors:', error.errors);
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to submit report'
    });
  }
});
// Get user's own reports
router.get('/my-reports', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const reports = await ErrorReport.getUserReports(userId);
    res.json({
      success: true,
      data: reports
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reports'
    });
  }
});
// Get all reports (admin only)
router.get('/', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }
    const { type, status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    let query = {};
    if (type) query.type = type;
    if (status) query.status = status;
    const reports = await ErrorReport.find(query)
      .populate('userId', 'username email')
      .populate('defaulterId', 'username email')
      .populate('commentId', 'content author')
      .populate('mangaId', 'title')
      .populate('reviewedBy', 'username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    const total = await ErrorReport.countDocuments(query);
    res.json({
      success: true,
      data: reports,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching error reports:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reports'
    });
  }
});
// Update report status (admin only)
router.put('/:id/status', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }
    const { id } = req.params;
    const { status, reviewNotes } = req.body;
    if (!['pending', 'reviewed', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }
    const report = await ErrorReport.findById(id);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }
    await report.markAsReviewed(req.user.id, status, reviewNotes);
    res.json({
      success: true,
      message: 'Report status updated successfully',
      data: report
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update report status'
    });
  }
});
// Delete report (admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }
    const { id } = req.params;
    const report = await ErrorReport.findByIdAndDelete(id);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }
    res.json({
      success: true,
      message: 'Report deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting error report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete report'
    });
  }
});
module.exports = router;