const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

/**
 * Read receipt for a broadcast Notification. One row per (notification, user)
 * that has opened/seen the notification.
 */
const notificationReadSchema = mongoose.Schema(
  {
    notificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Notification',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    readAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

notificationReadSchema.plugin(toJSON);

notificationReadSchema.index({ notificationId: 1, userId: 1 }, { unique: true });

const NotificationRead = mongoose.model('NotificationRead', notificationReadSchema);
module.exports = NotificationRead;
