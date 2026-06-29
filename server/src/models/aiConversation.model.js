const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * A single AI Business Assistant chat thread, scoped to one user within one
 * organization/branch (mirrors how ChatGPT groups messages into conversations).
 */
const aiConversationSchema = mongoose.Schema(
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
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 200,
      default: 'New chat',
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true, keepTimestampsInJSON: true }
);

aiConversationSchema.plugin(toJSON);
aiConversationSchema.plugin(paginate);

aiConversationSchema.index({ organizationId: 1, branchId: 1, userId: 1, lastMessageAt: -1 });

const AiConversation = mongoose.model('AiConversation', aiConversationSchema);
module.exports = AiConversation;
