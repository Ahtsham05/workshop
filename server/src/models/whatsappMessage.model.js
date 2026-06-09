const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const whatsappMessageSchema = mongoose.Schema(
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
      required: true,
      index: true,
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WhatsAppConversation',
      required: true,
      index: true,
    },
    direction: { type: String, enum: ['inbound', 'outbound'], required: true },
    metaMessageId: { type: String, trim: true, index: true, sparse: true },
    wamid: { type: String, trim: true, index: true, sparse: true },
    type: {
      type: String,
      enum: ['text', 'image', 'document', 'audio', 'video', 'template', 'interactive', 'location', 'sticker', 'reaction'],
      required: true,
    },
    content: {
      text: { type: String },
      caption: { type: String },
      mediaUrl: { type: String },
      mediaMimeType: { type: String },
      mediaId: { type: String },
      filename: { type: String },
      templateName: { type: String },
      templateParams: { type: mongoose.Schema.Types.Mixed },
      transcription: { type: String },
    },
    status: {
      type: String,
      enum: ['queued', 'sent', 'delivered', 'read', 'failed'],
      default: 'queued',
      index: true,
    },
    statusHistory: [
      {
        status: { type: String },
        at: { type: Date, default: Date.now },
        error: { type: String },
      },
    ],
    errorCode: { type: String },
    errorMessage: { type: String },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppCampaign' },
    source: {
      type: String,
      enum: ['inbox', 'invoice', 'campaign', 'attendance', 'fee', 'result', 'ai', 'api', 'homework', 'holiday'],
      default: 'inbox',
    },
  },
  { timestamps: true },
);

whatsappMessageSchema.plugin(toJSON);
whatsappMessageSchema.plugin(paginate);
whatsappMessageSchema.index({ organizationId: 1, branchId: 1, createdAt: -1 });
whatsappMessageSchema.index({ conversationId: 1, createdAt: 1 });

module.exports = mongoose.model('WhatsAppMessage', whatsappMessageSchema);
