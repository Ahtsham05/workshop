const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { getBranchContext, resolveWriteBranchId } = require('../utils/branchFilter');
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

/**
 * Same conversation engine as `sendMessage` above (both call aiAssistantService.sendMessage) —
 * this just streams the reply back as SSE frames instead of waiting for the whole thing. Wire
 * format matches whatsappInbox.controller.js#streamEvents (`data: {...}\n\n`), so it's consumed
 * the same way. A real `fetch()` POST carries the normal Authorization header fine, unlike a
 * native EventSource GET, so — unlike that endpoint — this doesn't need sseAuth's query-token
 * fallback; the router's existing auth('viewDashboard') + branchScope() middleware is enough.
 */
const sendMessageStream = catchAsync(async (req, res) => {
  const { organizationId, branchId, createdBy } = getBranchContext(req);
  const isSystemAdmin = req.user?.systemRole === 'superAdmin' || req.user?.systemRole === 'system_admin';
  const permissions = isSystemAdmin ? undefined : req.user?.role?.permissions || {};

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let closed = false;
  const send = (event) => {
    if (!closed) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Ties the Gemini fetch's AbortSignal to the client disconnecting (e.g. the Stop button),
  // so clicking Stop actually cancels backend generation instead of just hiding the frontend
  // "thinking" UI while Gemini keeps running unattended. Deliberately `res.on('close')`, not
  // `req.on('close')` — express.json() already fully drains `req`'s body stream before this
  // controller runs, so `req`'s own 'close' doesn't reliably fire again when the *response*
  // side disconnects. `res`'s 'close' is Node's documented event for "response completed OR
  // the underlying connection was terminated prematurely", which is what Stop actually needs.
  const abortController = new AbortController();
  res.on('close', () => {
    closed = true;
    abortController.abort();
  });

  try {
    const message = await aiAssistantService.sendMessage({
      conversationId: req.params.conversationId,
      organizationId,
      branchId,
      userId: createdBy,
      text: req.body.text,
      permissions,
      isSystemAdmin,
      onEvent: send,
      signal: abortController.signal,
    });
    send({ type: 'done', message });
  } catch (err) {
    send({ type: 'error', text: err.message || 'Something went wrong.' });
  } finally {
    if (!closed) res.end();
  }
});

const confirmAction = catchAsync(async (req, res) => {
  // create_invoice writes an Invoice, whose schema requires branchId — unlike sendMessage's
  // read-only tools (branchScope() only sets req.branchId when the client sends x-branch-id,
  // and getBranchContext() alone leaves it unset otherwise), a write needs a real fallback.
  // Same pattern product/customer/supplier "create" controllers already use.
  await resolveWriteBranchId(req);
  const { organizationId, branchId, createdBy } = getBranchContext(req);
  const isSystemAdmin = req.user?.systemRole === 'superAdmin' || req.user?.systemRole === 'system_admin';
  const permissions = isSystemAdmin ? undefined : req.user?.role?.permissions || {};

  const message = await aiAssistantService.confirmAction({
    conversationId: req.params.conversationId,
    messageId: req.params.messageId,
    organizationId,
    branchId,
    userId: createdBy,
    permissions,
    isSystemAdmin,
  });
  res.send(message);
});

const cancelAction = catchAsync(async (req, res) => {
  const { organizationId, createdBy } = getBranchContext(req);
  const message = await aiAssistantService.cancelAction({
    conversationId: req.params.conversationId,
    messageId: req.params.messageId,
    organizationId,
    userId: createdBy,
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
  sendMessageStream,
  confirmAction,
  cancelAction,
  deleteConversation,
};
