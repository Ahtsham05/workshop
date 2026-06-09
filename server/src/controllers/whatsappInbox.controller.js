const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const pick = require('../utils/pick');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');
const { inboxService, messagingService, eventsService } = require('../services/whatsapp');

const listConversations = catchAsync(async (req, res) => {
  const filter = applyBranchFilter(pick(req.query, ['status', 'assignedTo']), req);
  if (req.query.search) {
    filter.$or = [
      { contactName: { $regex: req.query.search, $options: 'i' } },
      { contactPhone: { $regex: req.query.search, $options: 'i' } },
      { lastMessagePreview: { $regex: req.query.search, $options: 'i' } },
    ];
  }
  if (req.query.unreadOnly === 'true') filter.unreadCount = { $gt: 0 };

  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.sortBy = options.sortBy || 'lastMessageAt:desc';
  const result = await inboxService.listConversations(filter, options);
  res.send(result);
});

const getConversation = catchAsync(async (req, res) => {
  const conversation = await inboxService.getConversationById(req.organizationId, req.branchId, req.params.id);
  if (!conversation) throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
  res.send(conversation);
});

const getMessages = catchAsync(async (req, res) => {
  const conversation = await inboxService.getConversationById(req.organizationId, req.branchId, req.params.id);
  if (!conversation) throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.sortBy = options.sortBy || 'createdAt:asc';
  const result = await inboxService.listMessages(conversation.id, options);
  res.send(result);
});

const markRead = catchAsync(async (req, res) => {
  const conversation = await inboxService.markConversationRead(req.organizationId, req.branchId, req.params.id);
  if (!conversation) throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
  res.send(conversation);
});

const updateConversation = catchAsync(async (req, res) => {
  const conversation = await inboxService.updateConversation(req.organizationId, req.branchId, req.params.id, req.body);
  if (!conversation) throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
  res.send(conversation);
});

const getUnreadCount = catchAsync(async (req, res) => {
  const count = await inboxService.getUnreadCount(req.organizationId, req.branchId);
  res.send({ count });
});

const sendMessage = catchAsync(async (req, res) => {
  const { phone, text, conversationId } = req.body;
  const result = await messagingService.sendText({
    organizationId: req.organizationId,
    branchId: req.branchId,
    phone,
    text,
    source: 'inbox',
    sentBy: req.user.id,
    conversationId,
  });
  res.send(result);
});

const streamEvents = catchAsync(async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const unsubscribe = eventsService.subscribe(req.organizationId, req.branchId, (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  req.on('close', () => unsubscribe());
});

module.exports = {
  listConversations,
  getConversation,
  getMessages,
  markRead,
  updateConversation,
  getUnreadCount,
  sendMessage,
  streamEvents,
};
