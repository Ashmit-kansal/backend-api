const sharp = require('sharp');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { r2Client } = require('../../config/r2');

class R2ImageUploadService {
  /**
   * Upload avatar to R2 with processing
   */
  static async uploadAvatar(buffer, filename) {
    try {
      console.log('🔄 Processing avatar for R2 upload...');
      
      // Process image with Sharp
      const processedBuffer = await sharp(buffer)
        .resize(400, 400, {
          fit: 'cover',
          position: 'center'
        })
        .webp({ 
          quality: 90,
          nearLossless: true,
          smartSubsample: true
        })
        .toBuffer();
      
      // Generate unique filename
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substr(2, 9);
      const key = `avatars/avatar_${timestamp}_${randomId}.webp`;
      
      console.log(`📤 Uploading avatar to R2: ${key}`);
      
      // Upload to R2
      const uploadCommand = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: processedBuffer,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000', // 1 year cache
        Metadata: {
          'original-filename': filename || 'avatar',
          'uploaded-at': new Date().toISOString(),
          'processed-by': 'sharp-webp'
        }
      });
      
      await r2Client.send(uploadCommand);
      
      const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
      
      console.log(`✅ Avatar uploaded successfully: ${publicUrl}`);
      
      return {
        secure_url: publicUrl,
        public_id: key,
        format: 'webp',
        width: 400,
        height: 400,
        bytes: processedBuffer.length
      };
      
    } catch (error) {
      console.error('❌ Error uploading avatar to R2:', error);
      throw error;
    }
  }
  
  /**
   * Delete avatar from R2
   */
  static async deleteAvatar(key) {
    try {
      if (!key) return;
      
      console.log(`🗑️ Deleting avatar from R2: ${key}`);
      
      const deleteCommand = new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key
      });
      
      await r2Client.send(deleteCommand);
      
      console.log(`✅ Avatar deleted successfully: ${key}`);
      
      return { result: 'ok' };
      
    } catch (error) {
      console.error('❌ Error deleting avatar from R2:', error);
      // Don't throw error for deletion failures
      return { result: 'error', message: error.message };
    }
  }
  
  /**
   * Update user avatar (delete old, upload new)
   */
  static async updateUserAvatar(user, buffer) {
    try {
      // Delete old avatar if exists
      if (user.avatarPublicId) {
        await this.deleteAvatar(user.avatarPublicId);
      }
      
      // Upload new avatar
      const result = await this.uploadAvatar(buffer);
      
      // Update user document
      user.avatar = result.secure_url;
      user.avatarPublicId = result.public_id;
      user.avatarUpdatedAt = new Date();
      await user.save();
      
      return {
        avatar: result.secure_url,
        avatarPublicId: result.public_id,
        avatarUpdatedAt: user.avatarUpdatedAt
      };
      
    } catch (error) {
      console.error('❌ Error updating user avatar:', error);
      throw error;
    }
  }
  
  /**
   * Get avatar update info
   */
  static async getAvatarUpdateInfo(user) {
    try {
      const canUpdate = user.canUpdateAvatar();
      const cooldown = user.getAvatarUpdateCooldown();
      
      return {
        currentAvatar: user.avatar,
        canUpdate,
        daysRemaining: canUpdate ? 0 : cooldown.days,
        lastUpdate: user.avatarUpdatedAt
      };
      
    } catch (error) {
      console.error('❌ Error getting avatar update info:', error);
      throw error;
    }
  }
  
  /**
   * Delete user avatar (cleanup)
   */
  static async deleteUserAvatar(key) {
    try {
      if (!key) return;
      await this.deleteAvatar(key);
    } catch (error) {
      console.error('❌ Error deleting user avatar:', error);
      // Don't throw error for cleanup failures
    }
  }
  
  /**
   * Validate image file
   */
  static validateImageFile(file) {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    const maxSize = 5 * 1024 * 1024; // 5MB
    
    if (!allowedTypes.includes(file.mimetype)) {
      throw new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF images are allowed.');
    }
    
    if (file.size > maxSize) {
      throw new Error('File size too large. Maximum size is 5MB.');
    }
    
    return true;
  }
}

module.exports = R2ImageUploadService;
