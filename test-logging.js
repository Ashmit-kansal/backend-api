#!/usr/bin/env node

/**
 * Test Logging Rate Script
 * 
 * This script tests the logging rate limiting to ensure it's working correctly
 * and preventing Railway rate limiting issues.
 * 
 * Usage: node test-logging.js
 */

const logger = require('./src/config/logger');

console.log('🧪 Testing logging rate limiting...\n');

// Test 1: Rapid logging (should be rate limited)
console.log('📊 Test 1: Rapid logging (should be rate limited)');
const startTime = Date.now();
let logCount = 0;

for (let i = 0; i < 200; i++) {
  logger.info(`Test log message ${i + 1}`);
  logCount++;
}

const endTime = Date.now();
const duration = endTime - startTime;
const rate = (logCount / duration) * 1000;

console.log(`   Logs attempted: ${logCount}`);
console.log(`   Duration: ${duration}ms`);
console.log(`   Rate: ${rate.toFixed(2)} logs/second`);
console.log(`   Expected: ~100 logs/second (rate limited)\n`);

// Test 2: Different log levels
console.log('📊 Test 2: Different log levels');
logger.error('This is an error message');
logger.warn('This is a warning message');
logger.info('This is an info message');
logger.debug('This is a debug message');

console.log('   All log levels tested\n');

// Test 3: Sustained logging over time
console.log('📊 Test 3: Sustained logging over time (10 seconds)');
let sustainedCount = 0;
const testDuration = 10000; // 10 seconds
const interval = setInterval(() => {
  logger.info(`Sustained log ${sustainedCount + 1}`);
  sustainedCount++;
}, 50); // 20 logs per second

setTimeout(() => {
  clearInterval(interval);
  const sustainedRate = (sustainedCount / (testDuration / 1000));
  console.log(`   Sustained logs: ${sustainedCount}`);
  console.log(`   Sustained rate: ${sustainedRate.toFixed(2)} logs/second`);
  console.log(`   Expected: ~100 logs/second (rate limited)\n`);
  
  // Test 4: Check if rate limiting resets
  console.log('📊 Test 4: Rate limiting reset (waiting 2 seconds)');
  setTimeout(() => {
    console.log('   Testing if rate limiting resets...');
    for (let i = 0; i < 50; i++) {
      logger.info(`Reset test log ${i + 1}`);
    }
    console.log('   Rate limiting reset test completed');
    console.log('\n✅ All tests completed!');
    console.log('💡 Check the logs to see rate limiting in action.');
  }, 2000);
  
}, testDuration);

console.log('   Test running... (will complete in 12 seconds)');
