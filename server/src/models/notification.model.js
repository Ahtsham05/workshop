const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * A broadcast notification sent by a school admin to one or more audiences
 * (teachers / students / parents). Read state is tracked per-user in the
 * separate NotificationRead collection so a single Notification document can
 * fan out to many recipients without duplicating rows.
 */
const notificationSchema = mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      index: true,
    },
    title: {
      type: String,
      trim: true,
      required: true,
      maxlength: 200,
    },
    message: {
      type: String,
      trim: true,
      required: true,
      maxlength: 4000,
    },
    /**
     * Which school roles should receive this notification. e.g. ['teacher'],
     * ['student'] or ['teacher', 'student'].
     */
    audience: {
      type: [String],
      enum: ['teacher', 'student', 'parent'],
      default: [],
    },
    type: {
      type: String,
      enum: ['general', 'fee', 'exam', 'event', 'urgent', 'attendance'],
      default: 'general',
    },
    /** When set, only this portal user sees the notification (e.g. per-student attendance alerts). */
    recipientUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

notificationSchema.plugin(toJSON);
notificationSchema.plugin(paginate);

notificationSchema.index({ organizationId: 1, audience: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);
module.exports = Notification;
