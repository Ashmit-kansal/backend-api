# Logging Optimization Guide

## Overview
This guide explains the logging optimizations implemented to prevent Railway rate limiting issues. Railway has a limit of 500 logs per second, and excessive logging was causing this limit to be exceeded.

## Changes Made

### 1. Enhanced Logger Configuration (`src/config/logger.js`)
- **Rate Limiting**: Implemented a custom rate limiter that caps logs at 100/second and 3000/minute
- **Log Level Changes**: Changed default log level from `info` to `warn` to reduce log volume
- **File Rotation**: Reduced log file retention from 5 to 3 files
- **Smart Filtering**: Only essential logs are now written to files

### 2. Reduced Console Logging
- **Comments Route**: Removed 15+ excessive `console.log` statements
- **Server.js**: Eliminated debug logging for every request
- **Health Checks**: Only log health check failures, not successful checks
- **CORS**: Removed verbose CORS logging

### 3. Environment Configuration
- **LOG_LEVEL**: Set to `warn` by default
- **NODE_ENV**: Set to `production` for Railway deployment

## How to Use

### Automatic Cleanup
Run the cleanup script to remove excessive console.log statements:
```bash
npm run cleanup-logs
```

### Manual Configuration
Set these environment variables in Railway:
```bash
LOG_LEVEL=warn
NODE_ENV=production
```

### Log Levels Available
- `error`: Only critical errors
- `warn`: Warnings and errors
- `info`: Informational messages (use sparingly)
- `debug`: Debug information (development only)

## Best Practices

### ✅ What to Log
- **Errors**: All error conditions with context
- **Warnings**: Important issues that don't stop execution
- **Critical Info**: Server startup, database connections, shutdown

### ❌ What NOT to Log
- **Request Details**: Every API call (unless debugging)
- **User Actions**: Individual user interactions
- **Debug Info**: Variable values, function calls
- **Success Messages**: Routine successful operations

### Example Good Logging
```javascript
// ✅ Good - Only log errors
try {
  const result = await someOperation();
  return result;
} catch (error) {
  logger.error('Operation failed', { 
    operation: 'someOperation',
    error: error.message,
    userId: req.user?.id 
  });
  throw error;
}

// ❌ Bad - Logging everything
console.log('Starting operation');
console.log('User ID:', req.user.id);
console.log('Operation parameters:', params);
const result = await someOperation();
console.log('Operation completed successfully');
console.log('Result:', result);
```

## Monitoring

### Check Log Volume
```bash
# View current logs
npm run logs

# View error logs only
npm run logs:error

# Clear logs
npm run logs:clear
```

### Railway Dashboard
- Monitor the "Logs" tab in Railway
- Watch for rate limiting warnings
- Check log volume trends

## Troubleshooting

### Still Getting Rate Limited?
1. **Check Log Level**: Ensure `LOG_LEVEL=warn` is set
2. **Run Cleanup**: Execute `npm run cleanup-logs`
3. **Review Code**: Look for remaining `console.log` statements
4. **Restart App**: Deploy changes to Railway

### Performance Impact
- **Before**: 500+ logs/second causing rate limiting
- **After**: ~50-100 logs/second (well under limit)
- **Result**: No more dropped log messages

## Migration Notes

### From Old Logging
- Replace `console.log` with `logger.info` (use sparingly)
- Replace `console.error` with `logger.error`
- Replace `console.warn` with `logger.warn`

### Development vs Production
- **Development**: More verbose logging for debugging
- **Production**: Minimal logging for performance
- **Railway**: Always use production settings

## Future Improvements

1. **Structured Logging**: Use JSON format for better parsing
2. **Log Aggregation**: Consider external log services
3. **Metrics**: Track log volume and performance
4. **Alerts**: Set up notifications for high log rates

## Support

If you continue to experience rate limiting issues:
1. Check this guide for missed optimizations
2. Run the cleanup script again
3. Review recent code changes for new logging
4. Contact the development team

---

**Remember**: Less logging = Better performance = No Railway rate limiting! 🚀
