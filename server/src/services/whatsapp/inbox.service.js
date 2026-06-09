const { WhatsAppConversation, WhatsAppMessage, Student, Customer } = require('../../models');
const { normalizePhone } = require('../../utils/whatsappPhone');
const eventsService = require('./events.service');

async function upsertConversation(connection, { contactPhone, contactName, contactWaId }) {
  const phone = normalizePhone(contactPhone);
  const conversation = await WhatsAppConversation.findOneAndUpdate(
    {
      organizationId: connection.organizationId,
      branchId: connection.branchId,
      contactPhone: phone,
    },
    {
      $set: {
        contactName: contactName || undefined,
        contactWaId: contactWaId || phone,
        lastMessageAt: new Date(),
      },
      $setOnInsert: {
        organizationId: connection.organizationId,
        branchId: connection.branchId,
        contactPhone: phone,
        status: 'open',
      },
    },
    { upsert: true, new: true },
  );

  await linkContactIfPossible(conversation);
  return conversation;
}

async function linkContactIfPossible(conversation) {
  if (conversation.customerId || conversation.studentId) return conversation;

  const phone = conversation.contactPhone;
  const customer = await Customer.findOne({
    organizationId: conversation.organizationId,
    branchId: conversation.branchId,
    $or: [{ phone }, { whatsapp: phone }],
  }).select('_id');
  if (customer) {
    conversation.customerId = customer._id;
    await conversation.save();
    return conversation;
  }

  const student = await Student.findOne({
    organizationId: conversation.organizationId,
    branchId: conversation.branchId,
    'parent.phone': { $regex: phone.slice(-10) },
  }).select('_id parentUserId');
  if (student) {
    conversation.studentId = student._id;
    conversation.parentUserId = student.parentUserId;
    await conversation.save();
  }
  return conversation;
}

function mapInboundType(msg) {
  return msg.type || 'text';
}

function extractInboundContent(msg) {
  switch (msg.type) {
    case 'text':
      return { text: msg.text?.body };
    case 'image':
      return { mediaId: msg.image?.id, caption: msg.image?.caption, mediaMimeType: msg.image?.mime_type };
    case 'document':
      return {
        mediaId: msg.document?.id,
        caption: msg.document?.caption,
        filename: msg.document?.filename,
        mediaMimeType: msg.document?.mime_type,
      };
    case 'audio':
      return { mediaId: msg.audio?.id, mediaMimeType: msg.audio?.mime_type };
    case 'video':
      return { mediaId: msg.video?.id, caption: msg.video?.caption, mediaMimeType: msg.video?.mime_type };
    default:
      return { text: JSON.stringify(msg) };
  }
}

async function storeInboundMessage(connection, conversation, msg) {
  const content = extractInboundContent(msg);
  const preview =
    content.text ||
    content.caption ||
    (msg.type === 'audio' ? '🎤 Voice message' : msg.type === 'document' ? '📄 Document' : `[${msg.type}]`);

  const message = await WhatsAppMessage.create({
    organizationId: connection.organizationId,
    branchId: connection.branchId,
    conversationId: conversation._id,
    direction: 'inbound',
    type: mapInboundType(msg),
    content,
    wamid: msg.id,
    metaMessageId: msg.id,
    status: 'delivered',
    statusHistory: [{ status: 'delivered', at: new Date() }],
    source: 'inbox',
  });

  conversation.lastMessageAt = new Date();
  conversation.lastMessagePreview = String(preview).slice(0, 200);
  conversation.lastMessageDirection = 'inbound';
  conversation.unreadCount = (conversation.unreadCount || 0) + 1;
  await conversation.save();

  eventsService.emitNewMessage(connection.organizationId, connection.branchId, conversation._id, message._id);
  eventsService.emitConversationUpdate(connection.organizationId, connection.branchId, conversation._id);

  return message;
}

async function listConversations(filter, options) {
  return WhatsAppConversation.paginate(filter, options);
}

async function getConversationById(organizationId, branchId, id) {
  return WhatsAppConversation.findOne({ _id: id, organizationId, branchId });
}

async function listMessages(conversationId, options) {
  return WhatsAppMessage.paginate({ conversationId }, options);
}

async function markConversationRead(organizationId, branchId, conversationId) {
  const conversation = await WhatsAppConversation.findOneAndUpdate(
    { _id: conversationId, organizationId, branchId },
    { unreadCount: 0 },
    { new: true },
  );
  if (conversation) {
    eventsService.emitConversationUpdate(organizationId, branchId, conversationId);
  }
  return conversation;
}

async function getUnreadCount(organizationId, branchId) {
  const result = await WhatsAppConversation.aggregate([
    { $match: { organizationId, branchId, unreadCount: { $gt: 0 } } },
    { $group: { _id: null, total: { $sum: '$unreadCount' } } },
  ]);
  return result[0]?.total || 0;
}

async function updateConversation(organizationId, branchId, conversationId, updates) {
  return WhatsAppConversation.findOneAndUpdate(
    { _id: conversationId, organizationId, branchId },
    updates,
    { new: true },
  );
}

module.exports = {
  upsertConversation,
  storeInboundMessage,
  listConversations,
  getConversationById,
  listMessages,
  markConversationRead,
  getUnreadCount,
  updateConversation,
  linkContactIfPossible,
};
