const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Rating = require('../models/Rating');
const Manga = require('../models/Manga');
// Get all ratings for the authenticated user
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const ratings = await Rating.find({ userId })
      .populate('mangaId', 'title coverImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    const total = await Rating.countDocuments({ userId });
    res.json({
      success: true,
      data: ratings,
      pagination: {
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        total
      }
    });
  } catch (error) {
    console.error('Error fetching user ratings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ratings'
    });
  }
});
// Get rating for a specific manga by user
router.get('/manga/:mangaId', auth, async (req, res) => {
  try {
    const { mangaId } = req.params;
    const userId = req.user.id;
    const rating = await Rating.findOne({ userId, mangaId });
    res.json({
      success: true,
      data: rating || null
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rating'
    });
  }
});
// Create or update rating
router.post('/', auth, async (req, res) => {
  try {
    const { mangaId, rating, review } = req.body;
    const userId = req.user.id;
    if (!mangaId || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Invalid rating data'
      });
    }
    // Check if user already rated this manga
    let existingRating = await Rating.findOne({ userId, mangaId });
    let isNewRating = false;
    let oldRating = null;
    if (existingRating) {
      // Update existing rating
      oldRating = existingRating.rating;
      existingRating.rating = rating;
      existingRating.review = review || existingRating.review;
      existingRating.updatedAt = new Date();
      await existingRating.save();
    } else {
      // Create new rating
      isNewRating = true;
      existingRating = new Rating({
        userId,
        mangaId,
        rating,
        review
      });
      await existingRating.save();
    }
    // Update manga stats
    try {
      const manga = await Manga.findById(mangaId);
      if (manga) {
        console.log(`🔍 Rating update debug for manga ${mangaId}:`, {
          isNewRating,
          oldRating,
          newRating: rating,
          currentStats: manga.stats,
          currentTotal: manga.stats.totalRatings || 0,
          currentAvg: manga.stats.averageRating || 0
        });
        if (isNewRating) {
          // New rating: increment total and recalculate average
          const currentTotal = manga.stats.totalRatings || 0;
          const currentAvg = manga.stats.averageRating || 0;
          const newTotal = currentTotal + 1;
          // Calculate new average safely
          let newAvg;
          if (currentTotal === 0) {
            // First rating ever
            newAvg = rating;
          } else {
            newAvg = ((currentAvg * currentTotal) + rating) / newTotal;
          }
          // Validate the calculation result
          if (isNaN(newAvg) || !isFinite(newAvg)) {
            console.warn(`⚠️ Invalid average calculation for manga ${mangaId}, using fallback`);
            newAvg = rating; // Fallback to just the rating
          }
          manga.stats.totalRatings = newTotal;
          manga.stats.averageRating = Math.round(newAvg * 10) / 10; // Round to 1 decimal
          console.log(`📊 New rating calculation:`, {
            currentTotal,
            currentAvg,
            newTotal,
            newAvg: manga.stats.averageRating
          });
        } else {
          // Updated rating: recalculate average (total stays the same)
          const currentTotal = manga.stats.totalRatings || 0;
          const currentAvg = manga.stats.averageRating || 0;
          if (currentTotal > 0) {
            // Calculate new average by removing old rating and adding new one
            const totalWithoutOld = (currentAvg * currentTotal) - oldRating;
            const newAvg = (totalWithoutOld + rating) / currentTotal;
            console.log(`📊 Rating update calculation:`, {
              currentTotal,
              currentAvg,
              oldRating,
              newRating: rating,
              totalWithoutOld,
              newAvg
            });
            // Validate the calculation result
            if (isNaN(newAvg) || !isFinite(newAvg)) {
              console.warn(`⚠️ Invalid average calculation for manga ${mangaId}, using fallback`);
              manga.stats.averageRating = rating; // Fallback to just the rating
            } else {
              manga.stats.averageRating = Math.round(newAvg * 10) / 10; // Round to 1 decimal
            }
          } else {
            // Edge case: no total ratings but updating? Set to current rating
            manga.stats.averageRating = rating;
            manga.stats.totalRatings = 1;
          }
        }
        await manga.save();
      }
    } catch (mangaUpdateError) {
      console.error('Error updating manga stats:', mangaUpdateError);
      // Continue with rating response even if manga stats update fails
    }
    res.json({
      success: true,
      data: existingRating,
      message: existingRating.review ? 'Rating updated successfully' : 'Rating created successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create/update rating'
    });
  }
});
// Delete rating
router.delete('/:mangaId', auth, async (req, res) => {
  try {
    const { mangaId } = req.params;
    const userId = req.user.id;
    const rating = await Rating.findOneAndDelete({ userId, mangaId });
    if (!rating) {
      return res.status(404).json({
        success: false,
        message: 'Rating not found'
      });
    }
    // Update manga stats when rating is deleted
    try {
      const manga = await Manga.findById(mangaId);
      if (manga && manga.stats.totalRatings > 0) {
        const currentTotal = manga.stats.totalRatings;
        const currentAvg = manga.stats.averageRating;
        const deletedRating = rating.rating;
        if (currentTotal === 1) {
          // Last rating deleted, reset stats
          manga.stats.totalRatings = 0;
          manga.stats.averageRating = 0;
        } else {
          // Recalculate average after removing the deleted rating
          const totalWithoutDeleted = (currentAvg * currentTotal) - deletedRating;
          const newTotal = currentTotal - 1;
          // Validate the calculation result
          let newAvg = 0;
          if (newTotal > 0) {
            newAvg = totalWithoutDeleted / newTotal;
            // Validate the calculation result
            if (isNaN(newAvg) || !isFinite(newAvg)) {
              console.warn(`⚠️ Invalid average calculation after deletion for manga ${mangaId}, resetting to 0`);
              newAvg = 0;
            }
          }
          manga.stats.totalRatings = newTotal;
          manga.stats.averageRating = Math.round(newAvg * 10) / 10; // Round to 1 decimal
        }
        await manga.save();
      }
    } catch (mangaUpdateError) {
      console.error('Error updating manga stats after rating deletion:', mangaUpdateError);
      // Continue with rating response even if manga stats update fails
    }
    res.json({
      success: true,
      message: 'Rating deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete rating'
    });
  }
});
module.exports = router;