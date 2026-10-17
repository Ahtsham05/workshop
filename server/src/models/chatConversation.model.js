const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

/**
 * A chat thread inside one organization (team chat between branches).
 *
 *   organization → "All branches": every staff member of the organization. One per org.
 *   branch       → one channel per branch; members are whoever works in that branch
 *                  (active Membership) plus the org's super admins. Derived live, never
 *                  stored, so hiring/moving staff needs no chat bookkeeping.
 *   direct       → exactly two people. `directKey` (sorted ids) makes it unique.
 *   group        → a named set of people picked by hand (e.g. "Branch managers").
 *
 * The organization and branch channels are created lazily the first time anyone opens
 * chat, so existing organizations need no migration.
 */
const chatConversationSchema = mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    type: { type: String, enum: ['organization', 'branch', 'direct', 'group'], required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    name: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    /** Direct and group threads only — channels derive their members. */
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    /** Group admins (the creator, plus anyone they promote). */
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    directKey: { type: String, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastMessage: {
      text: { type: String, default: '' },
      kind: { type: String, default: 'text' },
      senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      senderName: { type: String, default: '' },
      at: { type: Date, default: null },
    },
    lastMessageAt: { type: Date, default: null, index: true },
    messageCount: { type: Number, default: 0 },
  },
  // Message times are the whole point of a chat, so they stay in the JSON.
  { timestamps: true, keepTimestampsInJSON: true }
);

chatConversationSchema.index(
  { organizationId: 1, directKey: 1 },
  { unique: true, partialFilterExpression: { directKey: { $type: 'string' } } }
);
chatConversationSchema.index(
  { organizationId: 1, type: 1, branchId: 1 },
  { unique: true, partialFilterExpression: { type: { $in: ['organization', 'branch'] } } }
);
chatConversationSchema.index({ organizationId: 1, participants: 1 });

chatConversationSchema.plugin(toJSON);

const ChatConversation = mongoose.model('ChatConversation', chatConversationSchema);

module.exports = ChatConversation;
