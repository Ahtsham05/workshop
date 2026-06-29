const httpStatus = require('http-status');
const { AiConversation, AiMessage, Organization } = require('../models');
const ApiError = require('../utils/ApiError');
const geminiService = require('./aiAssistant/gemini.service');

const HISTORY_LIMIT = 20;

const createConversation = async ({ organizationId, branchId, userId, title }) =>
  AiConversation.create({ organizationId, branchId, userId, title: title || 'New chat' });

const listConversations = async ({ organizationId, branchId, userId }) =>
  AiConversation.find({ organizationId, userId, ...(branchId ? { branchId } : {}) })
    .sort({ lastMessageAt: -1 })
    .limit(100);

const getConversationOrThrow = async ({ conversationId, organizationId, userId }) => {
  const conversation = await AiConversation.findOne({ _id: conversationId, organizationId, userId });
  if (!conversation) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
  }
  return conversation;
};

const getMessages = async ({ conversationId, organizationId, userId }) => {
  await getConversationOrThrow({ conversationId, organizationId, userId });
  return AiMessage.find({ conversationId }).sort({ createdAt: 1 });
};

const deleteConversation = async ({ conversationId, organizationId, userId }) => {
  const conversation = await getConversationOrThrow({ conversationId, organizationId, userId });
  await Promise.all([
    AiMessage.deleteMany({ conversationId: conversation._id }),
    AiConversation.deleteOne({ _id: conversation._id }),
  ]);
};

const deriveTitle = (text) => String(text).trim().slice(0, 60) || 'New chat';

const sendMessage = async ({ conversationId, organizationId, branchId, userId, text }) => {
  const conversation = await getConversationOrThrow({ conversationId, organizationId, userId });

  await AiMessage.create({ conversationId, organizationId, branchId, userId, role: 'user', content: text });

  const isFirstMessage = conversation.title === 'New chat';
  if (isFirstMessage) {
    conversation.title = deriveTitle(text);
  }

  const recentMessages = await AiMessage.find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(HISTORY_LIMIT);
  const history = recentMessages.reverse().map((m) => ({ role: m.role, content: m.content }));

  const organization = await Organization.findById(organizationId).select('name businessType');
  const businessContext = {
    businessName: organization?.name,
    businessType: organization?.businessType,
    // The app has no per-organization currency setting — every screen in the product
    // (dashboard, invoices, reports) hardcodes Pakistani Rupees, so the assistant must match.
    currency: 'Rs',
  };

  const { text: replyText, toolCalls } = await geminiService.runConversation(
    history,
    { organizationId, branchId },
    businessContext,
  );

  const assistantMessage = await AiMessage.create({
    conversationId,
    organizationId,
    branchId,
    userId,
    role: 'assistant',
    content: replyText,
    toolCalls: toolCalls.length ? toolCalls : undefined,
  });

  conversation.lastMessageAt = new Date();
  await conversation.save();

  return assistantMessage;
};

module.exports = {
  createConversation,
  listConversations,
  getMessages,
  deleteConversation,
  sendMessage,
};
