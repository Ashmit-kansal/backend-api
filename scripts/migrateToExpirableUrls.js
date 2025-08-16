const mongoose = require('mongoose');
const dotenv = require('dotenv');
// Database connection function
const connectDB = async () => {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/manga-reader', {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000
    });
    console.log('✅ MongoDB connected successfully');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    throw err;
  }
};
const Manga = require('../src/models/Manga');
const Chapter = require('../src/models/Chapter');
const User = require('../src/models/User');

dotenv.config();

/**
 * Utility functions for working with Cloudinary URLs and public IDs
 */
const extractPublicIdFromUrl = (url) => {
  try {
    if (!url || typeof url !== 'string') {
      return null;
    }

    // Handle different Cloudinary URL formats
    const urlObj = new URL(url);
    
    // Check if it's a Cloudinary URL
    if (!urlObj.hostname.includes('cloudinary.com')) {
      return null;
    }

    const pathParts = urlObj.pathname.split('/');
    const uploadIndex = pathParts.findIndex(part => part === 'upload');
    
    if (uploadIndex === -1 || uploadIndex + 2 >= pathParts.length) {
      return null;
    }

    // Get everything after 'upload/v{version}/' and remove file extension
    const pathPartsAfterUpload = pathParts.slice(uploadIndex + 2);
    const publicId = pathPartsAfterUpload.join('/').replace(/\.[^/.]+$/, '');
    
    return publicId || null;
  } catch (error) {
    console.error('Error extracting public ID from URL:', error);
    return null;
  }
};

/**
 * Migration script to convert existing Cloudinary URLs to use expirable URLs
 * This script will:
 * 1. Extract public IDs from existing Cloudinary URLs
 * 2. Store them in new fields for future use
 * 3. Keep the original URLs for backward compatibility
 */

const migrateMangaCovers = async () => {
  console.log('🔄 Migrating manga cover images...');
  
  try {
    const mangas = await Manga.find({
      coverImage: { $exists: true, $ne: null }
    });

    console.log(`📚 Found ${mangas.length} manga with cover images to check`);

    let migrated = 0;
    let errors = 0;

    for (const manga of mangas) {
      try {
        if (manga.coverImage && typeof manga.coverImage === 'string' && !manga.coverImagePublicId) {
          const publicId = extractPublicIdFromUrl(manga.coverImage);
          
          if (publicId) {
            // Use updateOne with $set to ensure the field is properly saved
            const result = await Manga.updateOne(
              { _id: manga._id },
              { $set: { coverImagePublicId: publicId } }
            );
            
            if (result.modifiedCount > 0) {
              migrated++;
              console.log(`✅ Migrated cover for: ${manga.title} -> ${publicId}`);
            } else {
              console.log(`⚠️  No changes saved for manga ${manga.title}`);
              errors++;
            }
          } else {
            console.log(`⚠️  Could not extract public ID from: ${manga.coverImage}`);
            errors++;
          }
        }
      } catch (error) {
        console.error(`❌ Error migrating manga ${manga.title}:`, error.message);
        errors++;
      }
    }

    console.log(`✅ Manga covers migration completed: ${migrated} migrated, ${errors} errors`);
    return { migrated, errors };
  } catch (error) {
    console.error('❌ Error during manga covers migration:', error);
    throw error;
  }
};

const migrateChapterPages = async () => {
  console.log('🔄 Migrating chapter page images...');
  
  try {
    // Find all chapters with pages that have imageUrl but no cloudinaryPublicId
    const chapters = await Chapter.find({
      'pages.imageUrl': { $exists: true, $ne: null }
    });

    console.log(`📖 Found ${chapters.length} chapters to check for migration`);

    let migrated = 0;
    let errors = 0;
    let totalPages = 0;

    for (const chapter of chapters) {
      try {
        if (chapter.pages && Array.isArray(chapter.pages)) {
          let chapterUpdated = false;
          
          // Process all pages in the chapter
          for (let i = 0; i < chapter.pages.length; i++) {
            const page = chapter.pages[i];
            if (page.imageUrl && typeof page.imageUrl === 'string' && !page.cloudinaryPublicId) {
              const publicId = extractPublicIdFromUrl(page.imageUrl);
              
              if (publicId) {
                // Set the public ID directly on the page object
                chapter.pages[i].cloudinaryPublicId = publicId;
                chapterUpdated = true;
                totalPages++;
                console.log(`✅ Migrated page ${page.pageNumber || 'unknown'} -> ${publicId}`);
              } else {
                console.log(`⚠️  Could not extract public ID from: ${page.imageUrl}`);
                errors++;
              }
            }
          }
          
          // Save the entire chapter if any pages were updated
          if (chapterUpdated) {
            try {
              await chapter.save();
              migrated++;
              console.log(`💾 Saved chapter ${chapter._id} with updated pages`);
            } catch (saveError) {
              console.error(`❌ Failed to save chapter ${chapter._id}:`, saveError.message);
              errors++;
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error migrating chapter ${chapter._id}:`, error.message);
        errors++;
      }
    }

    console.log(`✅ Chapter pages migration completed: ${migrated} chapters, ${totalPages} pages migrated, ${errors} errors`);
    return { migrated, totalPages, errors };
  } catch (error) {
    console.error('❌ Error during chapter pages migration:', error);
    throw error;
  }
};

const migrateUserAvatars = async () => {
  console.log('🔄 Migrating user avatar images...');
  
  try {
    const users = await User.find({
      avatar: { $exists: true, $ne: null }
    });

    console.log(`👤 Found ${users.length} users with avatars to check`);

    let migrated = 0;
    let errors = 0;

    for (const user of users) {
      try {
        if (user.avatar && typeof user.avatar === 'string' && !user.avatarPublicId) {
          const publicId = extractPublicIdFromUrl(user.avatar);
          
          if (publicId) {
            // Use updateOne with $set to ensure the field is properly saved
            const result = await User.updateOne(
              { _id: user._id },
              { $set: { avatarPublicId: publicId } }
            );
            
            if (result.modifiedCount > 0) {
              migrated++;
              console.log(`✅ Migrated avatar for user: ${user.username || user.email} -> ${publicId}`);
            } else {
              console.log(`⚠️  No changes saved for user ${user.username || user.email}`);
              errors++;
            }
          } else {
            console.log(`⚠️  Could not extract public ID from: ${user.avatar}`);
            errors++;
          }
        }
      } catch (error) {
        console.error(`❌ Error migrating user ${user.username || user._id}:`, error.message);
        errors++;
      }
    }

    console.log(`✅ User avatars migration completed: ${migrated} migrated, ${errors} errors`);
    return { migrated, errors };
  } catch (error) {
    console.error('❌ Error during user avatars migration:', error);
    throw error;
  }
};

const validateMigration = async () => {
  console.log('🔍 Validating migration results...');
  
  try {
    // Check manga covers
    const mangaWithPublicIds = await Manga.countDocuments({
      coverImagePublicId: { $exists: true, $ne: null }
    });
    const totalManga = await Manga.countDocuments();
    
    // Check chapter pages - count actual pages with public IDs
    const chapters = await Chapter.find({});
    let totalPages = 0;
    let pagesWithPublicIds = 0;
    
    for (const chapter of chapters) {
      if (chapter.pages && Array.isArray(chapter.pages)) {
        totalPages += chapter.pages.length;
        for (const page of chapter.pages) {
          if (page.cloudinaryPublicId) {
            pagesWithPublicIds++;
          }
        }
      }
    }
    
    // Check user avatars
    const usersWithPublicIds = await User.countDocuments({
      avatarPublicId: { $exists: true, $ne: null }
    });
    const totalUsers = await User.countDocuments();

    console.log('📊 Migration validation results:');
    console.log(`   Manga covers: ${mangaWithPublicIds}/${totalManga} (${((mangaWithPublicIds/totalManga)*100).toFixed(1)}%)`);
    console.log(`   Chapter pages: ${pagesWithPublicIds}/${totalPages} (${((pagesWithPublicIds/totalPages)*100).toFixed(1)}%)`);
    console.log(`   User avatars: ${usersWithPublicIds}/${totalUsers} (${((usersWithPublicIds/totalUsers)*100).toFixed(1)}%)`);

    return {
      manga: { migrated: mangaWithPublicIds, total: totalManga },
      pages: { migrated: pagesWithPublicIds, total: totalPages },
      users: { migrated: usersWithPublicIds, total: totalUsers }
    };
  } catch (error) {
    console.error('❌ Error during validation:', error);
    throw error;
  }
};

const rollbackMigration = async () => {
  console.log('🔄 Rolling back migration...');
  
  try {
    // Remove public ID fields
    await Manga.updateMany(
      { coverImagePublicId: { $exists: true } },
      { $unset: { coverImagePublicId: 1 } }
    );

    await Chapter.updateMany(
      { 'pages.cloudinaryPublicId': { $exists: true } },
      { $unset: { 'pages.$.cloudinaryPublicId': 1 } }
    );

    await User.updateMany(
      { avatarPublicId: { $exists: true } },
      { $unset: { avatarPublicId: 1 } }
    );

    console.log('✅ Migration rollback completed');
  } catch (error) {
    console.error('❌ Error during rollback:', error);
    throw error;
  }
};

const main = async () => {
  try {
    console.log('🚀 Starting migration to expirable URLs...');
    
    // Connect to database
    await connectDB();
    console.log('✅ Connected to database');

    // Check command line arguments
    const args = process.argv.slice(2);
    const command = args[0];

    switch (command) {
      case 'migrate':
        console.log('🔄 Running full migration...');
        await migrateMangaCovers();
        await migrateChapterPages();
        await migrateUserAvatars();
        await validateMigration();
        break;
        
      case 'validate':
        console.log('🔍 Running validation only...');
        await validateMigration();
        break;
        
      case 'rollback':
        console.log('🔄 Running rollback...');
        await rollbackMigration();
        break;
        
      case 'covers':
        console.log('🔄 Migrating manga covers only...');
        await migrateMangaCovers();
        break;
        
      case 'chapters':
        console.log('🔄 Migrating chapter pages only...');
        await migrateChapterPages();
        break;
        
      case 'avatars':
        console.log('🔄 Migrating user avatars only...');
        await migrateUserAvatars();
        break;
        
      default:
        console.log('📖 Usage:');
        console.log('   node scripts/migrateToExpirableUrls.js migrate     - Run full migration');
        console.log('   node scripts/migrateToExpirableUrls.js validate    - Validate migration results');
        console.log('   node scripts/migrateToExpirableUrls.js rollback    - Rollback migration');
        console.log('   node scripts/migrateToExpirableUrls.js covers      - Migrate manga covers only');
        console.log('   node scripts/migrateToExpirableUrls.js chapters    - Migrate chapter pages only');
        console.log('   node scripts/migrateToExpirableUrls.js avatars     - Migrate user avatars only');
        break;
    }

    console.log('✅ Migration script completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

// Run the script
main();
