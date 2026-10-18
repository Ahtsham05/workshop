const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

/**
 * One message in a ChatConversation.
 *
 * The sender's name and branch are copied onto the message: in an inter-branch chat the
 * branch it was sent FROM is half the meaning ("Gulberg: 3 left, sending 2"), and it must
 * not change later if the person moves branch or is renamed.
 *
 * `product` is a snapshot of a shared product card; recipients additionally see live
 * stock for the same item in their own branch (looked up when they open it).
 */
const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: '' },
    name: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0 },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    /** Seconds, for video and audio (shown on the bubble before anything downloads). */
    duration: { type: Number, default: null },
    /** Recorded in the chat (WhatsApp voice note), not a picked audio file. */
    voice: { type: Boolean, default: false },
    /** Voice notes: loudness bars (0–100) drawn on the bubble before the audio downloads. */
    waveform: { type: [Number], default: undefined },
  },
  { _id: false }
);

const reactionSchema = new mongoose.Schema(
  {
    emoji: { type: String, required: true },
    userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { _id: false }
);

const chatMessageSchema = mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatConversation', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    senderName: { type: String, default: '' },
    senderBranchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    senderBranchName: { type: String, default: '' },
    kind: { type: String, enum: ['text', 'product', 'attachment', 'system'], default: 'text' },
    text: { type: String, default: '' },
    attachments: { type: [attachmentSchema], default: [] },
    product: {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
      name: { type: String, default: '' },
      sku: { type: String, default: '' },
      barcode: { type: String, default: '' },
      price: { type: Number, default: null },
      stock: { type: Number, default: null },
      unit: { type: String, default: '' },
      imageUrl: { type: String, default: '' },
      masterProductId: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
    replyTo: {
      messageId: { type: mongoose.Schema.Types.ObjectId, default: null },
      text: { type: String, default: '' },
      senderName: { type: String, default: '' },
    },
    reactions: { type: [reactionSchema], default: [] },
    /** Voice notes: who has played it (WhatsApp turns the mic blue for the sender). */
    playedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    /** Client-generated id so an optimistic bubble can be matched to the saved one. */
    clientId: { type: String, default: '' },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  // Message times are the whole point of a chat, so they stay in the JSON.
  { timestamps: true, keepTimestampsInJSON: true }
);

chatMessageSchema.index({ conversationId: 1, createdAt: -1 });
chatMessageSchema.index({ organizationId: 1, createdAt: -1 });

chatMessageSchema.plugin(toJSON);

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

module.exports = ChatMessage;
