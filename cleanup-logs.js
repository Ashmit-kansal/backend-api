#!/usr/bin/env node

/**
 * Log Cleanup Script
 * 
 * This script helps identify and remove excessive console.log statements
 * that are causing Railway rate limiting issues.
 * 
 * Usage: node cleanup-logs.js
 */

const fs = require('fs');
const path = require('path');

// Directories to scan
const directories = [
  './src/routes',
  './src/controllers',
  './src/middleware',
  './src/services',
  './src/utils'
];

// File extensions to process
const extensions = ['.js', '.ts'];

// Patterns to look for
const logPatterns = [
  /console\.log\(/g,
  /console\.warn\(/g,
  /console\.error\(/g,
  /console\.info\(/g,
  /console\.debug\(/g
];

// Patterns to keep (important logs)
const keepPatterns = [
  /console\.error\(/g,  // Keep error logs
  /console\.warn\(/g,   // Keep warning logs
  /Error:/,             // Keep error messages
  /Failed:/,            // Keep failure messages
  /Exception:/          // Keep exception messages
];

function shouldKeepLog(line) {
  return keepPatterns.some(pattern => pattern.test(line));
}

function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let modified = false;
    let removedCount = 0;
    
    const newLines = lines.map((line, index) => {
      const trimmedLine = line.trim();
      
      // Check if this line contains a console.log statement
      if (logPatterns.some(pattern => pattern.test(trimmedLine))) {
        // If it's an important log, keep it
        if (shouldKeepLog(trimmedLine)) {
          return line;
        }
        
        // Remove the console.log statement
        modified = true;
        removedCount++;
        
        // If the line only contains the console.log, remove it entirely
        if (trimmedLine.startsWith('console.') && trimmedLine.endsWith(';')) {
          return '';
        }
        
        // If it's a multi-line console.log, try to clean it up
        if (trimmedLine.includes('console.') && !trimmedLine.includes(';')) {
          // This is a multi-line log, we'll need to handle it carefully
          return line.replace(/console\.(log|warn|info|debug)\([^;]*\);?/g, '');
        }
        
        // Remove the console.log part
        return line.replace(/console\.(log|warn|info|debug)\([^;]*\);?/g, '');
      }
      
      return line;
    });
    
    if (modified) {
      // Remove empty lines
      const cleanedLines = newLines.filter(line => line.trim() !== '');
      fs.writeFileSync(filePath, cleanedLines.join('\n'));
      console.log(`✅ Cleaned ${filePath} (removed ${removedCount} console statements)`);
    }
    
    return { modified, removedCount };
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return { modified: false, removedCount: 0 };
  }
}

function scanDirectory(dir) {
  const results = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        results.push(...scanDirectory(fullPath));
      } else if (stat.isFile() && extensions.includes(path.extname(item))) {
        results.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`❌ Error scanning directory ${dir}:`, error.message);
  }
  
  return results;
}

function main() {
  console.log('🧹 Starting log cleanup process...\n');
  
  let totalFiles = 0;
  let totalModified = 0;
  let totalRemoved = 0;
  
  for (const dir of directories) {
    if (fs.existsSync(dir)) {
      const files = scanDirectory(dir);
      console.log(`📁 Scanning ${dir}: ${files.length} files`);
      
      for (const file of files) {
        totalFiles++;
        const result = processFile(file);
        if (result.modified) {
          totalModified++;
          totalRemoved += result.removedCount;
        }
      }
    } else {
      console.log(`⚠️  Directory ${dir} not found, skipping...`);
    }
  }
  
  console.log('\n📊 Cleanup Summary:');
  console.log(`   Total files scanned: ${totalFiles}`);
  console.log(`   Files modified: ${totalModified}`);
  console.log(`   Console statements removed: ${totalRemoved}`);
  
  if (totalRemoved > 0) {
    console.log('\n✅ Log cleanup completed successfully!');
    console.log('💡 This should significantly reduce your Railway log rate.');
    console.log('🚀 Remember to restart your application after cleanup.');
  } else {
    console.log('\n✨ No excessive logging found. Your code is already clean!');
  }
}

if (require.main === module) {
  main();
}

module.exports = { processFile, scanDirectory };
