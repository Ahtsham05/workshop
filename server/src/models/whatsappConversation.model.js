const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const whatsappConversationSchema = mongoose.Schema(
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
    contactPhone: { type: String, required: true, index: true },
    contactName: { type: String, trim: true },
    contactWaId: { type: String, trim: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lastMessageAt: { type: Date, index: true },
    lastMessagePreview: { type: String, trim: true },
    lastMessageDirection: { type: String, enum: ['inbound', 'outbound'] },
    // Meta's 24h customer-service window is measured from the customer's last inbound
    // message, not from any message in either direction — kept separate from lastMessageAt.
    lastInboundAt: { type: Date, index: true },
    unreadCount: { type: Number, default: 0 },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    tags: [{ type: String, trim: true }],
    status: { type: String, enum: ['open', 'closed', 'spam'], default: 'open', index: true },
    aiSessionActive: { type: Boolean, default: false },
    verifiedParent: { type: Boolean, default: false },
    linkedStudentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
    preferredLanguage: {
      type: String,
      enum: ['en', 'ur', 'pa', 'roman_ur'],
      default: 'en',
    },
  },
  { timestamps: true, toJSON: { virtuals: true } },
);

// Meta's Cloud API has no endpoint for a contact's WhatsApp profile photo (deliberate
// privacy restriction — businesses aren't "contacts" the way personal WhatsApp users are).
// This surfaces the photo the business already has on file for a linked Customer/Student
// instead, when the conversation has been matched to one. Requires customerId/studentId
// to be populated by the caller; otherwise resolves to undefined.
whatsappConversationSchema.virtual('avatarUrl').get(function () {
  return this.customerId?.picture?.url || this.studentId?.photoUrl?.url || undefined;
});

whatsappConversationSchema.plugin(toJSON);
whatsappConversationSchema.plugin(paginate);
whatsappConversationSchema.index({ organizationId: 1, branchId: 1, contactPhone: 1 }, { unique: true });
whatsappConversationSchema.index({ organizationId: 1, branchId: 1, lastMessageAt: -1 });
whatsappConversationSchema.index({ organizationId: 1, branchId: 1, unreadCount: 1 });

module.exports = mongoose.model('WhatsAppConversation', whatsappConversationSchema);
