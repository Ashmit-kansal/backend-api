const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');
// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
class ImageUploadService {
  static async uploadAvatar(buffer, filename) {
    try {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'manga-avatars',
            transformation: [
              { width: 400, height: 400, crop: 'fill', gravity: 'face' },
              { quality: 'auto', fetch_format: 'auto' }
            ],
            public_id: `avatar_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          }
        );
        // Convert buffer to stream
        const readableStream = new Readable();
        readableStream.push(buffer);
        readableStream.push(null);
        readableStream.pipe(uploadStream);
      });
    } catch (error) {
      console.error('Error uploading avatar to Cloudinary:', error);
      throw error;
    }
  }
  static async deleteAvatar(publicId) {
    try {
      if (!publicId) return;
      const result = await cloudinary.uploader.destroy(publicId);
      return result;
    } catch (error) {
      console.error('Error deleting avatar from Cloudinary:', error);
      // Don't throw error for deletion failures
    }
  }
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
      throw error;
    }
  }
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
      console.error('Error getting avatar update info:', error);
      throw error;
    }
  }
  static async deleteUserAvatar(publicId) {
    try {
      if (!publicId) return;
      await this.deleteAvatar(publicId);
    } catch (error) {
      console.error('Error deleting user avatar:', error);
      // Don't throw error for cleanup failures
    }
  }
}
module.exports = ImageUploadService;