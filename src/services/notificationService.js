const Notification = require('../models/Notification');

class NotificationService {
  static async createNotification(userId, type, title, message, data = {}) {
    try {
      const notification = new Notification({
        userId,
        type,
        title,
        message,
        data
      });
      return await notification.save();
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  static async getUserNotifications(userId, page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;
      const notifications = await Notification.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      
      const total = await Notification.countDocuments({ userId });
      
      return {
        notifications,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('Error fetching user notifications:', error);
      throw error;
    }
  }

  static async getUnreadCount(userId) {
    try {
      return await Notification.countDocuments({ userId, read: false });
    } catch (error) {
      console.error('Error getting unread count:', error);
      throw error;
    }
  }

  static async markAsRead(notificationId, userId) {
    try {
      const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, userId },
        { read: true },
        { new: true }
      );
      return notification;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  static async markAllAsRead(userId) {
    try {
      const result = await Notification.updateMany(
        { userId, read: false },
        { read: true }
      );
      return result;
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  static async deleteNotification(notificationId, userId) {
    try {
      const notification = await Notification.findOneAndDelete({
        _id: notificationId,
        userId
      });
      return notification;
    } catch (error) {
      console.error('Error deleting notification:', error);
      throw error;
    }
  }

  static async cleanupOldNotifications() {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const result = await Notification.deleteMany({
        createdAt: { $lt: thirtyDaysAgo }
      });
      return result;
    } catch (error) {
      console.error('Error cleaning up old notifications:', error);
      throw error;
    }
  }
}

module.exports = NotificationService;
