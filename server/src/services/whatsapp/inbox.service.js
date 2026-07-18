const mongoose = require('mongoose');
const httpStatus = require('http-status');
const ApiError = require('../../utils/ApiError');
const { WhatsAppConversation, WhatsAppMessage, Student, Customer } = require('../../models');
const { normalizePhone } = require('../../utils/whatsappPhone');
const { resolveContactNamesByPhone } = require('../../utils/resolveContactName');
const eventsService = require('./events.service');
const mediaService = require('./media.service');

// $match in an aggregation pipeline does no schema-aware casting (unlike .find()/
// .countDocuments()), so an organizationId/branchId that arrives as a header string
// rather than an ObjectId instance silently matches zero documents.
const toObjectId = (id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id));

const MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'sticker'];
const MEDIA_PREVIEWS = {
  audio: '🎤 Voice message',
  document: '📄 Document',
  image: '📷 Photo',
  video: '📹 Video',
  sticker: '🎨 Sticker',
};

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
    case 'sticker':
      return { mediaId: msg.sticker?.id, mediaMimeType: msg.sticker?.mime_type };
    default:
      return { text: JSON.stringify(msg) };
  }
}

async function storeInboundMessage(connection, conversation, msg) {
  // Meta redelivers webhooks it didn't get a fast/200 response for (common for media
  // messages, which take longer to process) — without this check, every redelivery
  // created a second identical message and re-triggered the AI assistant reply.
  const existing = await WhatsAppMessage.findOne({
    organizationId: connection.organizationId,
    branchId: connection.branchId,
    wamid: msg.id,
  });
  if (existing) {
    return { message: existing, isNew: false };
  }

  const content = extractInboundContent(msg);

  if (MEDIA_TYPES.includes(msg.type) && content.mediaId) {
    const persisted = await mediaService.persistInboundMedia(connection, content.mediaId);
    Object.assign(content, persisted);
  }

  const preview = content.text || content.caption || MEDIA_PREVIEWS[msg.type] || `[${msg.type}]`;

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
  conversation.lastInboundAt = conversation.lastMessageAt;
  conversation.lastMessagePreview = String(preview).slice(0, 200);
  conversation.lastMessageDirection = 'inbound';
  conversation.unreadCount = (conversation.unreadCount || 0) + 1;
  await conversation.save();

  eventsService.emitNewMessage(connection.organizationId, connection.branchId, conversation._id, message._id);
  eventsService.emitConversationUpdate(connection.organizationId, connection.branchId, conversation._id);

  return { message, isNew: true };
}

const AVATAR_POPULATE = [
  { path: 'customerId', select: 'picture' },
  { path: 'studentId', select: 'photoUrl' },
];

async function listConversations(filter, options) {
  return WhatsAppConversation.paginate(filter, { ...options, populate: AVATAR_POPULATE });
}

async function getConversationById(organizationId, branchId, id) {
  return WhatsAppConversation.findOne({ _id: id, organizationId, branchId }).populate(AVATAR_POPULATE);
}

async function listMessages(conversationId, options) {
  return WhatsAppMessage.paginate({ conversationId }, options);
}

const SUCCESS_STATUSES = ['sent', 'delivered', 'read'];

// Org/branch-wide message log — every WhatsApp message sent (or received), regardless of
// which conversation it belongs to. Powers the "Message Log" dashboard: filterable by
// status/source/direction/date and searchable by contact, with a status-group summary
// (computed over the same filters minus `status` itself) so the filter tabs can show live
// counts without a second round trip per tab.
async function listAllMessages(organizationId, branchId, filters = {}) {
  const { status, direction = 'outbound', source, search, from, to, page = 1, limit = 20 } = filters;

  const baseMatch = { organizationId: toObjectId(organizationId), branchId: toObjectId(branchId) };
  if (direction && direction !== 'all') baseMatch.direction = direction;
  if (source) baseMatch.source = source;
  if (from || to) {
    baseMatch.createdAt = {};
    if (from) baseMatch.createdAt.$gte = new Date(from);
    if (to) baseMatch.createdAt.$lte = new Date(to);
  }

  if (search) {
    const conversations = await WhatsAppConversation.find({
      organizationId,
      branchId,
      $or: [
        { contactName: { $regex: search, $options: 'i' } },
        { contactPhone: { $regex: search, $options: 'i' } },
      ],
    }).select('_id');
    baseMatch.conversationId = { $in: conversations.map((c) => c._id) };
  }

  const match = { ...baseMatch };
  if (status === 'success') match.status = { $in: SUCCESS_STATUSES };
  else if (status && status !== 'all') match.status = status;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

  const [results, totalResults, counts] = await Promise.all([
    WhatsAppMessage.find(match)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate({
        path: 'conversationId',
        select: 'contactName contactPhone customerId studentId',
        populate: [
          { path: 'customerId', select: 'name' },
          { path: 'studentId', select: 'parent.fatherName parent.motherName parent.guardianName' },
        ],
      })
      .populate('sentBy', 'name'),
    WhatsAppMessage.countDocuments(match),
    WhatsAppMessage.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          success: { $sum: { $cond: [{ $in: ['$status', SUCCESS_STATUSES] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          queued: { $sum: { $cond: [{ $eq: ['$status', 'queued'] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const { total = 0, success = 0, failed = 0, queued = 0 } = counts[0] || {};

  // Prefer the name saved against the linked Customer/Student over the contact's own
  // WhatsApp profile name (contactName) — the latter is whatever the customer set on
  // their own phone, which is often not the name the business actually knows them by.
  const withResolvedNames = results.map((m) => {
    const json = m.toJSON();
    const conversation = json.conversationId;
    if (conversation) {
      const parent = conversation.studentId?.parent;
      const studentName = parent?.fatherName || parent?.motherName || parent?.guardianName;
      conversation.contactName = conversation.customerId?.name || studentName || undefined;
      delete conversation.customerId;
      delete conversation.studentId;
    }
    return json;
  });

  // Conversations created before a matching Customer/Supplier/Student existed (or whose
  // regex match at creation time simply missed) never got customerId/studentId linked —
  // fall back to a live phone lookup so the log still shows a saved name where one exists.
  const unresolved = withResolvedNames
    .map((m) => m.conversationId)
    .filter((c) => c && !c.contactName && c.contactPhone);
  if (unresolved.length) {
    const nameMap = await resolveContactNamesByPhone(organizationId, branchId, unresolved.map((c) => c.contactPhone));
    for (const conversation of unresolved) {
      conversation.contactName = nameMap.get(normalizePhone(conversation.contactPhone)?.slice(-10));
    }
  }

  return {
    results: withResolvedNames,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.max(1, Math.ceil(totalResults / limitNum)),
    totalResults,
    summary: { total, success, failed, queued },
  };
}

// Deleting is restricted to failed messages — this is a log-cleanup action, not a way to
// edit conversation history, so anything that actually sent (queued/sent/delivered/read)
// stays put.
async function deleteMessage(organizationId, branchId, messageId) {
  const message = await WhatsAppMessage.findOne({ _id: messageId, organizationId, branchId });
  if (!message) throw new ApiError(httpStatus.NOT_FOUND, 'Message not found');
  if (message.status !== 'failed') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Only failed messages can be deleted');
  }
  await WhatsAppMessage.deleteOne({ _id: message._id });
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
  listAllMessages,
  deleteMessage,
  markConversationRead,
  getUnreadCount,
  updateConversation,
  linkContactIfPossible,
};
