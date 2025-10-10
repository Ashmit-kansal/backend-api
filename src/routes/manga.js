const express = require('express');
const router = express.Router();
const Manga = require('../models/Manga');
const Chapter = require('../models/Chapter');
// Function to calculate relevance score for search results
function calculateRelevanceScore(manga, searchQuery) {
  let score = 0;
  const query = searchQuery.toLowerCase();
  const title = manga.title.toLowerCase();
  const altTitles = (manga.alternativeTitles || []).map(t => t.toLowerCase());
  
  
  // Exact title match (highest priority)
  if (title === query) {
    score += 1000;
  }
  // Title starts with query
  if (title.startsWith(query)) {
    score += 500;
  }
  // Title contains query as a phrase
  if (title.includes(query)) {
    score += 300;
  }
  // Alternative titles exact match
  if (altTitles.some(alt => alt === query)) {
    score += 800;
  }
  // Alternative titles start with query
  if (altTitles.some(alt => alt.startsWith(query))) {
    score += 400;
  }
  // Alternative titles contain query
  if (altTitles.some(alt => alt.includes(query))) {
    score += 200;
  }
  // Individual word matches (improved)
  const queryWords = query.split(/\s+/).filter(word => 
    word.length >= 3 && // At least 3 characters
    !['the', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'an', 'a'].includes(word.toLowerCase())
  );
  
  queryWords.forEach(word => {
    // Word at start of title (higher score for significant words)
    if (title.startsWith(word)) {
      score += 150; // Increased from 100
    }
    // Word anywhere in title (using word boundaries)
    const wordBoundaryRegex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (wordBoundaryRegex.test(title)) {
      score += 75; // Increased from 50
    }
    // Word in alternative titles (using word boundaries)
    if (altTitles.some(alt => wordBoundaryRegex.test(alt))) {
      score += 40; // Increased from 30
    }
  });
  // Bonus for shorter titles (more specific matches)
  if (title.length <= query.length + 10) {
    score += 20;
  }
  // Bonus for recent updates
  if (manga.lastUpdated) {
    const daysSinceUpdate = (Date.now() - new Date(manga.lastUpdated).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate <= 7) {
      score += 10;
    }
  }
  return score;
}

// Helper to build the search $or conditions similar to inline logic below
function buildSearchOrConditions(search) {
  const searchWords = search.trim().split(/\s+/).filter(word => word.length >= 1);
  const or = [
    // Exact matches first
    { title: { $regex: `^${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
    { alternativeTitles: { $regex: `^${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
    // Starts with matches
    { title: { $regex: `^${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' } },
    { alternativeTitles: { $regex: `^${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' } },
    // Contains matches (full phrase)
    { title: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
    { alternativeTitles: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
  ];

  if (searchWords.length > 1) {
    const significantWords = searchWords.filter(word =>
      word.length >= 3 && !['the','and','or','in','on','at','to','for','of','with','by','an','a'].includes(word.toLowerCase())
    );
    if (significantWords.length >= 2 && significantWords.length >= searchWords.length * 0.6) {
      significantWords.forEach(word => {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        or.push(
          { title: { $regex: `\\b${escaped}\\b`, $options: 'i' } },
          { alternativeTitles: { $regex: `\\b${escaped}\\b`, $options: 'i' } }
        );
      });
    }
  }
  return or;
}
// Debug route to check database indexes
router.get('/debug/indexes', async (req, res) => {
  try {
    const indexes = await Manga.collection.getIndexes();
    // Test text search functionality
    const testResults = await Manga.find({ $text: { $search: 'test' } }).limit(1);
    res.json({
      success: true,
      indexes: indexes,
      textSearchWorking: testResults.length >= 0,
      totalManga: await Manga.countDocuments({}),
      sampleManga: await Manga.find({}).select('title').limit(3)
    });
  } catch (error) {
    console.error('Error checking indexes:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// Route to recreate text index
router.post('/debug/recreate-index', async (req, res) => {
  try {
    // Drop existing text index if it exists
    try {
      await Manga.collection.dropIndex('manga_text_search');
    } catch (dropError) {
    }
    // Create new text index
    await Manga.collection.createIndex({ 
      title: 'text', 
      genres: 'text',
      alternativeTitles: 'text',
      description: 'text',
      author: 'text'
    }, {
      weights: {
        title: 10,
        alternativeTitles: 8,
        author: 6,
        genres: 4,
        description: 2
      },
      name: "manga_text_search"
    });
    res.json({
      success: true,
      message: 'Text index recreated successfully'
    });
  } catch (error) {
    console.error('Error recreating index:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// Get indexable manga for sitemap (only manga that should be indexed by search engines)
router.get('/indexable', async (req, res) => {
  try {
    const { limit = 500 } = req.query;
    const indexableManga = await Manga.find({ indexable: true })
      .select('title slug lastUpdated')
      .sort({ lastUpdated: -1 })
      .limit(parseInt(limit))
      .lean();
    
    res.json({
      success: true,
      data: indexableManga,
      total: indexableManga.length
    });
  } catch (error) {
    console.error('Error fetching indexable manga:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Simple test endpoint to verify backend is working
router.get('/test', async (req, res) => {
  try {
    const totalManga = await Manga.countDocuments({});
    const sampleManga = await Manga.find({}).select('title').limit(3);
    res.json({
      success: true,
      message: 'Backend is working',
      totalManga,
      sampleManga: sampleManga.map(m => m.title)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// Simple search test endpoint
router.get('/search-test', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.json({
        success: false,
        message: 'Query parameter "q" is required'
      });
    }
    // Simple regex search
    const results = await Manga.find({ 
      title: { $regex: q, $options: 'i' } 
    }).select('title alternativeTitles').limit(5);
    res.json({
      success: true,
      query: q,
      results: results.map(m => ({
        title: m.title,
        alternativeTitles: m.alternativeTitles || []
      }))
    });
  } catch (error) {
    console.error('Search test error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// Get all manga with pagination and search
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', genre = '', status = '', sortBy = 'lastUpdated', sortOrder = 'desc' } = req.query;
    const query = {};
    // Search functionality
    if (search) {
      // Create a more intelligent search query with relevance scoring
      const searchWords = search.trim().split(/\s+/).filter(word => word.length >= 1);
      const searchLower = search.toLowerCase();
      // Build search conditions with different priority levels
      const exactMatchConditions = [];
      const partialMatchConditions = [];
      const containsMatchConditions = [];
      // Priority 1: Exact title matches (highest priority)
      exactMatchConditions.push({ title: { $regex: `^${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
      // Priority 2: Title starts with search query
      exactMatchConditions.push({ title: { $regex: `^${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' } });
      // Priority 3: Title contains search query as a phrase
      exactMatchConditions.push({ title: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } });
      // Priority 4: Alternative titles exact matches
      exactMatchConditions.push({ alternativeTitles: { $regex: `^${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
      exactMatchConditions.push({ alternativeTitles: { $regex: `^${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' } });
      exactMatchConditions.push({ alternativeTitles: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } });
      // Priority 5: Individual word matches in title
      searchWords.forEach(word => {
        if (word.length >= 2) {
          const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          // Word at start of title
          partialMatchConditions.push({ title: { $regex: `^${escapedWord}`, $options: 'i' } });
          // Word anywhere in title
          partialMatchConditions.push({ title: { $regex: escapedWord, $options: 'i' } });
          // Word in alternative titles
          partialMatchConditions.push({ alternativeTitles: { $regex: escapedWord, $options: 'i' } });
        }
      });
      // Priority 6: Author and description matches
      searchWords.forEach(word => {
        if (word.length >= 2) {
          const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          containsMatchConditions.push({ author: { $regex: escapedWord, $options: 'i' } });
          containsMatchConditions.push({ description: { $regex: escapedWord, $options: 'i' } });
        }
      });
      // Combine all conditions with priority order - use a simpler approach
      query.$or = [
        // Exact matches first (highest priority)
        { title: { $regex: `^${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
        { alternativeTitles: { $regex: `^${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
        // Starts with matches
        { title: { $regex: `^${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' } },
        { alternativeTitles: { $regex: `^${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' } },
        // Contains matches (full phrase)
        { title: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
        { alternativeTitles: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
      ];
      
      // IMPROVED: Only add word-based matches for significant words (avoid common words like "the", "a", "an")
      if (searchWords.length > 1) {
        const significantWords = searchWords.filter(word => 
          word.length >= 3 && // At least 3 characters
          !['the', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'an', 'a'].includes(word.toLowerCase())
        );
        
        console.log('🔍 Search words:', searchWords);
        console.log('🔍 Significant words for matching:', significantWords);
        
        // Only add word matches if we have significant words AND they represent most of the search
        if (significantWords.length >= 2 && significantWords.length >= searchWords.length * 0.6) {
          significantWords.forEach(word => {
            const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Only match words at word boundaries to avoid partial matches within words
            query.$or.push(
              { title: { $regex: `\\b${escapedWord}\\b`, $options: 'i' } },
              { alternativeTitles: { $regex: `\\b${escapedWord}\\b`, $options: 'i' } }
            );
          });
        }
      } else {
        console.log('🔍 Search words:', searchWords);
      }
      
      console.log('🔍 Total OR conditions in query:', query.$or.length);
    }
    // Genre filter
    if (genre) {
      query.genres = { $in: [genre] };
    }
    // Status filter
    if (status) {
      query.status = status;
    }
    const skip = (page - 1) * limit;
    let manga;
    
    // Build sort options based on sortBy and sortOrder parameters
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    let sortOptions = {};
    
    // Map frontend sortBy values to database field names
    switch (sortBy) {
      case 'rating':
        sortOptions = { 'stats.averageRating': sortDirection, 'stats.totalRatings': -1 };
        break;
      case 'views':
        sortOptions = { 'stats.views': sortDirection };
        break;
      case 'bookmarks':
        sortOptions = { 'stats.bookmarkCount': sortDirection };
        break;
      case 'totalRatings':
        sortOptions = { 'stats.totalRatings': sortDirection };
        break;
      case 'lastUpdated':
      default:
        sortOptions = { lastUpdated: sortDirection };
        break;
    }
    
    if (search) {
      // Enhanced backend search - now handles all edge cases without frontend fallback needed
      try {
        // For search queries, use intelligent sorting based on relevance
        const allResults = await Manga.find(query)
          .select('_id slug title coverImage genres status authors description stats lastUpdated alternativeTitles')
          .limit(30) // Increased limit for better sorting pool
          .lean(); // Use lean() for better performance
        
        // Sort results by relevance score
        const sortedResults = allResults.sort((a, b) => {
          const aScore = calculateRelevanceScore(a, search);
          const bScore = calculateRelevanceScore(b, search);
          return bScore - aScore; // Higher score first
        });
        
        // Take only the top 5 most relevant results
        manga = sortedResults.slice(0, 5);
        
        // If no results from complex query, try a simpler fallback approach
        if (manga.length === 0) {
          console.log('🔄 No results from complex search, trying simpler approach...');
          
          // Simpler query - just title and alternative title matching
          const simpleQuery = {
            $or: [
              { title: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
              { alternativeTitles: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
            ]
          };
          
          const simpleResults = await Manga.find(simpleQuery)
            .select('_id slug title coverImage genres status authors description stats lastUpdated alternativeTitles')
            .limit(10)
            .lean();
            
          // Sort by relevance and take top 5
          manga = simpleResults.sort((a, b) => {
            const aScore = calculateRelevanceScore(a, search);
            const bScore = calculateRelevanceScore(b, search);
            return bScore - aScore;
          }).slice(0, 5);
        }
        
        console.log('🔍 Search results:', manga.map(m => m.title));
      } catch (searchError) {
        console.error('Search error:', searchError);
        // Fallback to empty results instead of crashing
        manga = [];
      }
    } else {
      // For regular queries, use the specified sort options
      manga = await Manga.find(query)
        .select('_id slug title coverImage genres status authors description stats lastUpdated alternativeTitles')
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit));
    }
    const total = await Manga.countDocuments(query);
    res.json({
      success: true,
      data: manga,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching manga:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch manga'
    });
  }
});

// New: Paginated search endpoint with relevance scoring respected and limit/page honored
router.get('/search', async (req, res) => {
  try {
    const { q, search, page = 1, limit = 20 } = req.query;
    const term = (q || search || '').trim();
    const pageNum = Math.max(1, parseInt(page));
    const pageLimit = Math.max(1, Math.min(parseInt(limit) || 20, 50)); // cap to 50 per page

    if (!term) {
      return res.status(400).json({ success: false, message: 'Query parameter "q" (or "search") is required' });
    }

    const query = { $or: buildSearchOrConditions(term) };

    // Pool size: fetch enough docs to score and paginate reliably for first few pages
    const MAX_POOL = Math.max(100, Math.min(pageLimit * 5, 300)); // 5 pages worth, capped at 300

    const fields = '_id slug title coverImage genres status authors description stats lastUpdated alternativeTitles';
    const pool = await Manga.find(query).select(fields).limit(MAX_POOL).lean();

    const sorted = pool.sort((a, b) => calculateRelevanceScore(b, term) - calculateRelevanceScore(a, term));

    const start = (pageNum - 1) * pageLimit;
    const end = start + pageLimit;
    const pageItems = sorted.slice(start, end);

    // totalItems in pool and total matches (count) for transparency
    const totalMatches = await Manga.countDocuments(query);
    const totalScored = sorted.length;
    const totalPages = Math.ceil(totalScored / pageLimit);

    return res.json({
      success: true,
      data: pageItems,
      pagination: {
        page: pageNum,
        itemsPerPage: pageLimit,
        totalPages,
        totalItems: totalMatches,
        totalItemsScored: totalScored,
        note: totalMatches > totalScored ? 'Pagination limited to top-scored pool' : undefined
      }
    });
  } catch (error) {
    console.error('Error in paginated search:', error);
    res.status(500).json({ success: false, message: 'Failed to perform search' });
  }
});
// Get manga by slug
router.get('/slug/:slug', async (req, res) => {
  try {
    const manga = await Manga.findOne({ slug: req.params.slug });
    if (!manga) {
      return res.status(404).json({
        success: false,
        message: 'Manga not found'
      });
    }
    // Fetch chapters for this manga
    const chapters = await Chapter.find({ mangaId: manga._id })
      .select('_id chapterNumber title scrapedAt lastUpdated createdAt updatedAt')
      .sort({ chapterNumber: 1 });
    // Create manga data with chapters included
    const mangaWithChapters = {
      ...manga.toObject(),
      chapters: chapters
    };
    // Increment views unless explicitly skipped (e.g., metadata fetch from chapter page)
    if (!req.query.skipIncrement) {
      manga.stats.views += 1;
      await manga.save();
    }
    res.json({
      success: true,
      data: mangaWithChapters
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch manga by slug'
    });
  }
});
// Get manga by ID
router.get('/:id', async (req, res) => {
  try {
    const manga = await Manga.findById(req.params.id);
    if (!manga) {
      return res.status(404).json({
        success: false,
        message: 'Manga not found'
      });
    }
    // Fetch chapters for this manga
    const chapters = await Chapter.find({ mangaId: manga._id })
      .select('_id chapterNumber title scrapedAt lastUpdated createdAt updatedAt')
      .sort({ chapterNumber: 1 });
    // Create manga data with chapters included
    const mangaWithChapters = {
      ...manga.toObject(),
      chapters: chapters
    };
    // Only increment views if not a refresh request (skipIncrement=true)
    // This prevents double-counting when the frontend refreshes manga data
    // after user actions like rating submission
    if (!req.query.skipIncrement) {
      manga.stats.views += 1;
      await manga.save();
    }
    res.json({
      success: true,
      data: mangaWithChapters
    });
  } catch (error) {
    console.error('Error fetching manga by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch manga'
    });
  }
});
// Create new manga
router.post('/', async (req, res) => {
  try {
    const mangaData = req.body;
    const manga = new Manga(mangaData);
    await manga.save();
    res.status(201).json({
      success: true,
      data: manga
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create manga'
    });
  }
});
// Update manga
router.put('/:id', async (req, res) => {
  try {
    const manga = await Manga.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!manga) {
      return res.status(404).json({
        success: false,
        message: 'Manga not found'
      });
    }
    res.json({
      success: true,
      data: manga
    });
  } catch (error) {
    console.error('Error updating manga:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update manga'
    });
  }
});
// Delete manga
router.delete('/:id', async (req, res) => {
  try {
    const manga = await Manga.findByIdAndDelete(req.params.id);
    if (!manga) {
      return res.status(404).json({
        success: false,
        message: 'Manga not found'
      });
    }
    // Also delete associated chapters
    await Chapter.deleteMany({ mangaId: req.params.id });
    res.json({
      success: true,
      message: 'Manga deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete manga'
    });
  }
});
// Get manga by genre
router.get('/genre/:genre', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    const manga = await Manga.find({
      genres: { $in: [req.params.genre] }
    })
    .select('_id slug title coverImage genres status authors description stats lastUpdated')
    .sort({ lastUpdated: -1 })
    .skip(skip)
    .limit(parseInt(limit));
    const total = await Manga.countDocuments({
      genres: { $in: [req.params.genre] }
    });
    res.json({
      success: true,
      data: manga,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching manga by genre:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch manga by genre'
    });
  }
});


// This old Cloudinary endpoint has been removed

module.exports = router;
