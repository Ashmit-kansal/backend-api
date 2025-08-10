const Manga = require('../models/Manga');
const Chapter = require('../models/Chapter');
const User = require('../models/User');
const Bookmark = require('../models/Bookmark');

const sampleManga = [
  {
    title: "One Piece",
    slug: "one-piece",
    author: "Eiichiro Oda",
    description: "Follow the adventures of Monkey D. Luffy and his pirate crew as they search for the legendary treasure known as One Piece.",
    summary: "A tale of pirates, friendship, and adventure on the high seas.",
    coverImage: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=600&fit=crop&crop=center",
    genres: ["Action", "Adventure", "Comedy", "Fantasy"],
    status: "Ongoing",
    publicationYear: 1997,
    alternativeTitles: ["ワンピース"],
    stats: {
      views: 15000,
      totalChapters: 5,
      averageRating: 4.8,
      totalRatings: 1250
    }
  },
  {
    title: "Naruto",
    slug: "naruto",
    author: "Masashi Kishimoto",
    description: "The story of Naruto Uzumaki, a young ninja who seeks to become the strongest ninja in his village.",
    summary: "A coming-of-age story about a young ninja's journey to become the strongest.",
    coverImage: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&h=600&fit=crop&crop=center",
    genres: ["Action", "Adventure", "Fantasy"],
    status: "Completed",
    publicationYear: 1999,
    alternativeTitles: ["ナルト"],
    stats: {
      views: 12000,
      totalChapters: 5,
      averageRating: 4.5,
      totalRatings: 980
    }
  },
  {
    title: "Dragon Ball",
    slug: "dragon-ball",
    author: "Akira Toriyama",
    description: "The story of Goku, a martial artist with superhuman abilities, as he searches for the Dragon Balls.",
    summary: "An epic martial arts adventure with superhuman battles and mystical quests.",
    coverImage: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=600&fit=crop&crop=center",
    genres: ["Action", "Adventure", "Comedy", "Fantasy"],
    status: "Completed",
    publicationYear: 1984,
    alternativeTitles: ["ドラゴンボール"],
    stats: {
      views: 18000,
      totalChapters: 5,
      averageRating: 4.7,
      totalRatings: 1450
    }
  }
];

const sampleChapters = [
  {
    chapterNumber: 1,
    title: "The Beginning",
    pages: [
      { pageNumber: 1, imageUrl: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&h=1200&fit=crop&crop=center" },
      { pageNumber: 2, imageUrl: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&h=1200&fit=crop&crop=center" },
      { pageNumber: 3, imageUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=1200&fit=crop&crop=center" }
    ],
    views: 500
  },
  {
    chapterNumber: 2,
    title: "The Journey Begins",
    pages: [
      { pageNumber: 1, imageUrl: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=1200&fit=crop&crop=center" },
      { pageNumber: 2, imageUrl: "https://images.unsplash.com/photo-1568454537842-d933259bb258?w=800&h=1200&fit=crop&crop=center" },
      { pageNumber: 3, imageUrl: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&h=1200&fit=crop&crop=center" }
    ],
    views: 450
  },
  {
    chapterNumber: 3,
    title: "The Challenge",
    pages: [
      { pageNumber: 1, imageUrl: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&h=1200&fit=crop&crop=center" },
      { pageNumber: 2, imageUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=1200&fit=crop&crop=center" },
      { pageNumber: 3, imageUrl: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=1200&fit=crop&crop=center" }
    ],
    views: 400
  },
  {
    chapterNumber: 4,
    title: "The Battle",
    pages: [
      { pageNumber: 1, imageUrl: "https://images.unsplash.com/photo-1568454537842-d933259bb258?w=800&h=1200&fit=crop&crop=center" },
      { pageNumber: 2, imageUrl: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&h=1200&fit=crop&crop=center" },
      { pageNumber: 3, imageUrl: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&h=1200&fit=crop&crop=center" }
    ],
    views: 380
  },
  {
    chapterNumber: 5,
    title: "The Victory",
    pages: [
      { pageNumber: 1, imageUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=1200&fit=crop&crop=center" },
      { pageNumber: 2, imageUrl: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=1200&fit=crop&crop=center" },
      { pageNumber: 3, imageUrl: "https://images.unsplash.com/photo-1568454537842-d933259bb258?w=800&h=1200&fit=crop&crop=center" }
    ],
    views: 350
  }
];

const sampleUsers = [
  {
    username: 'testuser',
    email: 'test@example.com',
    name: 'Test User',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // 'password' hashed
    isActive: true
  }
];

async function seedData() {
  try {
    console.log('🌱 Starting data seeding...');
    
    // Clear existing data
    await Manga.deleteMany({});
    await Chapter.deleteMany({});
    await User.deleteMany({});
    await Bookmark.deleteMany({});
    
    console.log('🗑️ Cleared existing data');
    
    // Create users
    const createdUsers = [];
    for (const userData of sampleUsers) {
      const user = new User(userData);
      const savedUser = await user.save();
      createdUsers.push(savedUser);
      console.log(`👤 Created user: ${savedUser.username}`);
    }
    
    // Create manga
    const createdManga = [];
    for (const mangaData of sampleManga) {
      const manga = new Manga(mangaData);
      const savedManga = await manga.save();
      createdManga.push(savedManga);
      console.log(`📚 Created manga: ${savedManga.title}`);
    }
    
    // Create chapters for each manga
    for (const manga of createdManga) {
      for (const chapterData of sampleChapters) {
        const chapter = new Chapter({
          ...chapterData,
          mangaId: manga._id
        });
        await chapter.save();
        console.log(`📖 Created chapter ${chapterData.chapterNumber} for ${manga.title}`);
      }
    }
    
    // Create sample bookmarks for the test user
    if (createdUsers.length > 0 && createdManga.length > 0) {
      const testUser = createdUsers[0];
      const firstManga = createdManga[0];
      const firstChapter = await Chapter.findOne({ mangaId: firstManga._id }).sort({ chapterNumber: 1 });
      
      if (firstChapter) {
        const bookmark = new Bookmark({
          userId: testUser._id,
          mangaId: firstManga._id,
          lastReadId: firstChapter._id
        });
        await bookmark.save();
        
        // Update bookmarkCount in manga stats
        await Manga.findByIdAndUpdate(firstManga._id, {
          $inc: { 'stats.bookmarkCount': 1 }
        });
        
        console.log(`🔖 Created bookmark for ${firstManga.title} for user ${testUser.username}`);
      }
    }
    
    console.log('✅ Data seeding completed successfully!');
    console.log(`📊 Created ${createdUsers.length} users, ${createdManga.length} manga with ${createdManga.length * sampleChapters.length} chapters total`);
    
  } catch (error) {
    console.error('❌ Error seeding data:', error);
  }
}

module.exports = { seedData };
