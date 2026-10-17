const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

/**
 * Per-person state of one conversation: how far they have read (drives unread badges and
 * "Seen" ticks) and their own mute / pin choice. Missing row = nothing read, not muted.
 */
const chatReadStateSchema = mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatConversation', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lastReadAt: { type: Date, default: null },
    muted: { type: Boolean, default: false },
    pinned: { type: Boolean, default: false },
    /** Set when someone leaves a group, so it drops out of their list. */
    leftAt: { type: Date, default: null },
  },
  { timestamps: true }
);

chatReadStateSchema.index({ conversationId: 1, userId: 1 }, { unique: true });
chatReadStateSchema.index({ userId: 1, organizationId: 1 });

chatReadStateSchema.plugin(toJSON);

const ChatReadState = mongoose.model('ChatReadState', chatReadStateSchema);

module.exports = ChatReadState;
