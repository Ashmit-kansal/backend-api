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
  
  // Individual word matches
  const queryWords = query.split(/\s+/).filter(word => word.length >= 2);
  queryWords.forEach(word => {
    // Word at start of title
    if (title.startsWith(word)) {
      score += 100;
    }
    
    // Word anywhere in title
    if (title.includes(word)) {
      score += 50;
    }
    
    // Word in alternative titles
    if (altTitles.some(alt => alt.includes(word))) {
      score += 30;
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

// Debug route to check database indexes
router.get('/debug/indexes', async (req, res) => {
  try {
    const indexes = await Manga.collection.getIndexes();
    console.log('🔍 Database indexes:', indexes);
    
    // Test text search functionality
    const testResults = await Manga.find({ $text: { $search: 'test' } }).limit(1);
    console.log('🔍 Text search test results:', testResults.length);
    
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
      console.log('✅ Dropped existing text index');
    } catch (dropError) {
      console.log('ℹ️ No existing text index to drop');
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
    
    console.log('✅ Text index recreated successfully');
    
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
    console.error('Test endpoint error:', error);
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
    console.log('🔍 Search test query:', q);
    
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
    
    console.log(`🔍 Search test found ${results.length} results for "${q}"`);
    
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
    const { page = 1, limit = 20, search = '', genre = '', status = '' } = req.query;
    
    const query = {};
    
    // Search functionality
    if (search) {
      console.log('🔍 Text search query:', search);
      
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
      
      // Combine all conditions with priority order
      query.$or = [
        ...exactMatchConditions,
        ...partialMatchConditions,
        ...containsMatchConditions
      ];
      
      console.log('🔍 Search query with priorities:', JSON.stringify(query));
      console.log('🔍 Search words:', searchWords);
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
    let sortOptions = {};
    
    if (search) {
      // For search queries, use intelligent sorting based on relevance
      const allResults = await Manga.find(query)
        .select('_id slug title coverImage genres status authors description stats lastUpdated alternativeTitles')
        .limit(20); // Get more results for better sorting
      
      // Sort results by relevance score
      const sortedResults = allResults.sort((a, b) => {
        const aScore = calculateRelevanceScore(a, search);
        const bScore = calculateRelevanceScore(b, search);
        return bScore - aScore; // Higher score first
      });
      
      // Take only the top 5 most relevant results
      manga = sortedResults.slice(0, 5);
      
      console.log(`🔍 Search found ${manga.length} results for: "${search}"`);
      if (manga.length > 0) {
        console.log('🔍 First result:', manga[0].title);
        console.log('🔍 All results:', manga.map(m => m.title));
        console.log('🔍 Relevance scores:', manga.map(m => ({ title: m.title, score: calculateRelevanceScore(m, search) })));
      } else {
        // Debug: Show some manga titles from the database to see what's available
        console.log('🔍 No search results found. Checking database contents...');
        try {
          const sampleManga = await Manga.find({}).select('title alternativeTitles').limit(5);
          console.log('🔍 Sample manga in database:', sampleManga.map(m => ({
            title: m.title,
            alternativeTitles: m.alternativeTitles
          })));
          
          // Test basic regex search
          const testSearch = await Manga.find({ title: { $regex: search, $options: 'i' } }).select('title').limit(3);
          console.log('🔍 Test regex search results:', testSearch.map(m => m.title));
        } catch (debugError) {
          console.log('🔍 Could not fetch sample manga for debugging:', debugError.message);
        }
      }
    } else {
      // For regular queries, sort by lastUpdated
      manga = await Manga.find(query)
        .select('_id slug title coverImage genres status authors description stats lastUpdated alternativeTitles')
        .sort({ lastUpdated: -1 })
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
      .select('_id chapterNumber title publishedAt views')
      .sort({ chapterNumber: 1 });
    
    // Create manga data with chapters included
    const mangaWithChapters = {
      ...manga.toObject(),
      chapters: chapters
    };
    
    // Increment views
    manga.stats.views += 1;
    await manga.save();
    
    res.json({
      success: true,
      data: mangaWithChapters
    });
  } catch (error) {
    console.error('Error fetching manga by slug:', error);
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
      .select('_id chapterNumber title publishedAt views')
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
    console.error('Error creating manga:', error);
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
    console.error('Error deleting manga:', error);
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

module.exports = router;
