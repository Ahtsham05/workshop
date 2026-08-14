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
  // auth('viewDashboard') on this router already populated req.user.role for non-admins
  // (see middlewares/permission.js#checkPermission) — reuse it so the assistant's tool
  // catalog respects the same RBAC as the rest of the app instead of exposing every
  // domain (profit margins, salaries, ledgers) to whoever can merely see the dashboard.
  const isSystemAdmin = req.user?.systemRole === 'superAdmin' || req.user?.systemRole === 'system_admin';
  const permissions = isSystemAdmin ? undefined : req.user?.role?.permissions || {};

  const message = await aiAssistantService.sendMessage({
    conversationId: req.params.conversationId,
    organizationId,
    branchId,
    userId: createdBy,
    text: req.body.text,
    permissions,
    isSystemAdmin,
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
