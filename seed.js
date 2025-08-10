require('dotenv').config();
const mongoose = require('mongoose');
const { seedData } = require('./src/utils/seedData');

async function runSeed() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/manga-reader');
    console.log('🔌 Connected to MongoDB');
    
    // Run the seed data
    await seedData();
    
    console.log('🎉 Seeding completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error running seed:', error);
    process.exit(1);
  }
}

runSeed();
