const cloudinary = require('cloudinary').v2;
const crypto = require('crypto');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

class ExpirableUrlService {
  /**
   * Generate a signed URL for Cloudinary image with expiration
   * @param {string} publicId - Cloudinary public ID
   * @param {number} expiresIn - Expiration time in seconds (default: 1 hour)
   * @param {Array} transformations - Optional transformations to apply
   * @returns {string} - Signed expirable URL
   */
  static generateSignedUrl(publicId, expiresIn = 3600, transformations = []) {
    try {
      if (!publicId) {
        throw new Error('Public ID is required');
      }

      // Ensure expiresIn is a valid number and has a reasonable default
      const validExpiresIn = typeof expiresIn === 'number' && !isNaN(expiresIn) && expiresIn > 0 
        ? expiresIn 
        : 3600; // Default to 1 hour if invalid

      // Set expiration timestamp
      const expiresAt = Math.round(Date.now() / 1000) + validExpiresIn;

      console.log('🔧 Service: Generating URL with:', {
        publicId,
        expiresIn: validExpiresIn,
        expiresAt,
        currentTime: Math.round(Date.now() / 1000),
        timeRemaining: validExpiresIn
      });

      // Create transformation string
      let transformationString = '';
      if (transformations && transformations.length > 0) {
        transformationString = transformations.map(t => {
          if (typeof t === 'string') return t;
          return Object.entries(t).map(([key, value]) => `${key}_${value}`).join(',');
        }).join('/');
      }

      // Build the URL path
      const resourcePath = transformationString ? `${transformationString}/${publicId}` : publicId;

      // Create signature
      const signature = this.generateSignature(expiresAt, resourcePath);

      // Build the final URL
      const baseUrl = `https://res.cloudinary.com/${cloudinary.config().cloud_name}/image/upload`;
      const queryParams = new URLSearchParams({
        s: signature,
        e: expiresAt.toString()
      });

      return `${baseUrl}/${resourcePath}?${queryParams.toString()}`;
    } catch (error) {
      console.error('Error generating signed URL:', error);
      throw error;
    }
  }

  /**
   * Generate signature for Cloudinary signed URLs
   * @param {number} expiresAt - Expiration timestamp
   * @param {string} resourcePath - Resource path with transformations
   * @returns {string} - Generated signature
   */
  static generateSignature(expiresAt, resourcePath) {
    const apiSecret = cloudinary.config().api_secret;
    const stringToSign = `expires=${expiresAt}&public_id=${resourcePath}`;
    
    return crypto
      .createHmac('sha1', apiSecret)
      .update(stringToSign)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Generate expirable URL for manga cover image
   * @param {string} publicId - Cloudinary public ID
   * @param {number} expiresIn - Expiration time in seconds
   * @returns {string} - Expirable cover image URL
   */
  static generateCoverUrl(publicId, expiresIn = 7200) { // 2 hours for covers
    // Don't apply transformations that could interfere with original image structure
    // Just generate a basic signed URL to preserve the original format
    return this.generateSignedUrl(publicId, expiresIn, []);
  }

  /**
   * Generate expirable URL for chapter page image
   * @param {string} publicId - Cloudinary public ID
   * @param {number} expiresIn - Expiration time in seconds
   * @returns {string} - Expirable chapter page URL
   */
  static generateChapterPageUrl(publicId, expiresIn = 1800) { // 30 minutes for chapter pages
    // Don't apply transformations that could interfere with original image structure
    // Just generate a basic signed URL to preserve the original format
    return this.generateSignedUrl(publicId, expiresIn, []);
  }

  /**
   * Generate expirable URL for avatar image
   * @param {string} publicId - Cloudinary public ID
   * @param {number} expiresIn - Expiration time in seconds
   * @returns {string} - Expirable avatar URL
   */
  static generateAvatarUrl(publicId, expiresIn = 86400) { // 24 hours for avatars
    // Don't apply transformations that could interfere with original image structure
    // Just generate a basic signed URL to preserve the original format
    return this.generateSignedUrl(publicId, expiresIn, []);
  }

  /**
   * Generate expirable URL with custom transformations
   * @param {string} publicId - Cloudinary public ID
   * @param {Object} options - Options object
   * @param {number} options.expiresIn - Expiration time in seconds
   * @param {Array} options.transformations - Array of transformations
   * @param {string} options.format - Output format
   * @param {string} options.quality - Quality setting
   * @returns {string} - Expirable URL with custom settings
   */
  static generateCustomUrl(publicId, options = {}) {
    const {
      expiresIn = 3600,
      transformations = [],
      format = 'auto',
      quality = 'auto:good'
    } = options;

    const defaultTransformations = [
      { quality },
      { fetch_format: format }
    ];

    const allTransformations = [...defaultTransformations, ...transformations];
    
    return this.generateSignedUrl(publicId, expiresIn, allTransformations);
  }

  /**
   * Validate if a signed URL is still valid
   * @param {string} url - Signed URL to validate
   * @returns {boolean} - True if URL is still valid
   */
  static isUrlValid(url) {
    try {
      const urlObj = new URL(url);
      const expiresAt = urlObj.searchParams.get('e');
      
      if (!expiresAt) return false;
      
      const currentTime = Math.round(Date.now() / 1000);
      return parseInt(expiresAt) > currentTime;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get expiration time from signed URL
   * @param {string} url - Signed URL
   * @returns {number|null} - Expiration timestamp or null if invalid
   */
  static getExpirationTime(url) {
    try {
      const urlObj = new URL(url);
      const expiresAt = urlObj.searchParams.get('e');
      return expiresAt ? parseInt(expiresAt) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get time remaining until URL expires
   * @param {string} url - Signed URL
   * @returns {number|null} - Seconds remaining or null if invalid
   */
  static getTimeRemaining(url) {
    const expiresAt = this.getExpirationTime(url);
    if (!expiresAt) return null;
    
    const currentTime = Math.round(Date.now() / 1000);
    const remaining = expiresAt - currentTime;
    
    return remaining > 0 ? remaining : 0;
  }
}

module.exports = ExpirableUrlService;
