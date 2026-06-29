const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { getBranchContext } = require('../utils/branchFilter');
const { aiAssistantService } = require('../services');

const createConversation = catchAsync(async (req, res) => {
  const { organizationId, branchId, createdBy } = getBranchContext(req);
  const conversation = await aiAssistantService.createConversation({
    organizationId,
    branchId,
    userId: createdBy,
    title: req.body.title,
  });
  res.status(httpStatus.CREATED).send(conversation);
});

const listConversations = catchAsync(async (req, res) => {
  const { organizationId, branchId, createdBy } = getBranchContext(req);
  const conversations = await aiAssistantService.listConversations({ organizationId, branchId, userId: createdBy });
  res.send(conversations);
});

const getMessages = catchAsync(async (req, res) => {
  const { organizationId, createdBy } = getBranchContext(req);
  const messages = await aiAssistantService.getMessages({
    conversationId: req.params.conversationId,
    organizationId,
    userId: createdBy,
  });
  res.send(messages);
});

const sendMessage = catchAsync(async (req, res) => {
  const { organizationId, branchId, createdBy } = getBranchContext(req);
  const message = await aiAssistantService.sendMessage({
    conversationId: req.params.conversationId,
    organizationId,
    branchId,
    userId: createdBy,
    text: req.body.text,
  });
  res.send(message);
});

const deleteConversation = catchAsync(async (req, res) => {
  const { organizationId, createdBy } = getBranchContext(req);
  await aiAssistantService.deleteConversation({
    conversationId: req.params.conversationId,
    organizationId,
    userId: createdBy,
  });
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createConversation,
  listConversations,
  getMessages,
  sendMessage,
  deleteConversation,
};
