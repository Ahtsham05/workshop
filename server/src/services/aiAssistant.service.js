const httpStatus = require('http-status');
const { AiConversation, AiMessage, Organization, Customer, Product } = require('../models');
const ApiError = require('../utils/ApiError');
const geminiService = require('./aiAssistant/gemini.service');
const invoiceService = require('./invoice.service');
const customerLedgerService = require('./customerLedger.service');

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

const getMessageOrThrow = async ({ conversationId, messageId, organizationId, userId }) => {
  await getConversationOrThrow({ conversationId, organizationId, userId });
  const message = await AiMessage.findOne({ _id: messageId, conversationId, organizationId });
  if (!message) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Message not found');
  }
  return message;
};

// Maps a write tool's name to how its preview's params get pulled out for the pendingAction —
// add a new entry here (plus a matching executor in EXECUTORS_BY_KIND below) for any future
// write tool, rather than hardcoding one tool name the way this used to.
const PARAMS_BY_KIND = {
  create_invoice: (preview) => ({
    customerId: preview.customerId,
    productId: preview.productId,
    quantity: preview.quantity,
    unitPrice: preview.unitPrice,
    total: preview.total,
  }),
  record_payment: (preview) => ({ customerId: preview.customerId, amount: preview.amount }),
};

/**
 * Looks for a write-tool call that only produced a preview (never a DB write — see
 * tools/actions.js) and turns it into a `pendingAction` for the message to carry, so the
 * frontend can render a Confirm/Cancel card bound to these exact resolved params. Only one
 * pending action per message; if the model called more than one write tool in a turn (it
 * shouldn't, given the system prompt, but never trust that alone), the first wins.
 */
const buildPendingAction = (toolCalls) => {
  const actionCall = toolCalls.find((tc) => PARAMS_BY_KIND[tc.name] && tc.result && tc.result.status === 'preview');
  if (!actionCall) return undefined;
  const { preview } = actionCall.result;
  return {
    kind: actionCall.name,
    status: 'pending',
    params: PARAMS_BY_KIND[actionCall.name](preview),
    preview,
  };
};

/**
 * Shared by both the buffered (JSON) and streaming (SSE) endpoints — one conversation engine
 * either way. Pass `onEvent` (and optionally `signal`) to stream deltas/status as they arrive;
 * omit it to get the older behavior of awaiting the full reply before returning.
 */
const sendMessage = async ({
  conversationId,
  organizationId,
  branchId,
  userId,
  text,
  permissions,
  isSystemAdmin,
  onEvent,
  signal,
}) => {
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

  const ctx = { organizationId, branchId, permissions, isSystemAdmin, userId, conversationId };
  const { text: replyText, toolCalls, interrupted } = onEvent
    ? await geminiService.runConversationStream(history, ctx, businessContext, onEvent, signal)
    : await geminiService.runConversation(history, ctx, businessContext);

  const assistantMessage = await AiMessage.create({
    conversationId,
    organizationId,
    branchId,
    userId,
    role: 'assistant',
    content: replyText,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    interrupted: interrupted || undefined,
    pendingAction: toolCalls.length ? buildPendingAction(toolCalls) : undefined,
  });

  conversation.lastMessageAt = new Date();
  await conversation.save();

  return assistantMessage;
};

// Which permission(s) confirming each action kind requires — OR'd, matching the app's own
// auth() middleware semantics, and matching the exact keys each tool declares in tools/actions.js
// (checked again here rather than trusted from the preview, since permissions can change between
// when a message was sent and when it's confirmed).
const PERMISSIONS_BY_KIND = {
  create_invoice: ['createInvoices'],
  record_payment: ['createPayments', 'viewAccounting', 'manageLedgers'],
};

const hasRequiredPermission = (kind, permissions, isSystemAdmin) => {
  if (isSystemAdmin === true) return true;
  const required = PERMISSIONS_BY_KIND[kind];
  return !!required && required.some((key) => permissions && permissions[key] === true);
};

/** Re-validates entities and calls invoiceService.createInvoice — see tools/actions.js#prepareCreateInvoice. */
const executeCreateInvoiceAction = async (params, { organizationId, branchId, userId }) => {
  const isWalkIn = params.customerId === 'walk-in';
  const [customer, product] = await Promise.all([
    isWalkIn ? Promise.resolve(null) : Customer.findOne({ _id: params.customerId, organizationId }),
    Product.findOne({ _id: params.productId, organizationId }),
  ]);
  if (!isWalkIn && !customer) throw new ApiError(httpStatus.BAD_REQUEST, 'That customer no longer exists.');
  if (!product) throw new ApiError(httpStatus.BAD_REQUEST, 'That product no longer exists.');

  const invoice = await invoiceService.createInvoice(
    {
      organizationId,
      branchId,
      customerId: params.customerId,
      type: 'cash',
      paymentMethod: 'cash',
      items: [
        { productId: params.productId, name: product.name, quantity: params.quantity, unitPrice: params.unitPrice, subtotal: params.total },
      ],
      subtotal: params.total,
      total: params.total,
      totalProfit: 0,
      totalCost: 0,
    },
    userId
  );
  return { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber };
};

/**
 * Re-validates the customer and calls customerLedgerService.createLedgerEntry — see
 * tools/actions.js#prepareRecordPayment. Reduces the customer's overall ledger balance (Cash
 * Book + accounts posting all happen inside that one call); does not touch any specific
 * invoice's own paidAmount/balance, since the preview never asked which invoice this was for.
 */
const executeRecordPaymentAction = async (params, { organizationId, branchId }) => {
  const customer = await Customer.findOne({ _id: params.customerId, organizationId });
  if (!customer) throw new ApiError(httpStatus.BAD_REQUEST, 'That customer no longer exists.');

  const entry = await customerLedgerService.createLedgerEntry({
    organizationId,
    branchId,
    customer: params.customerId,
    transactionType: 'payment_received',
    transactionDate: new Date(),
    description: 'Payment received via AI Assistant',
    debit: 0,
    credit: params.amount,
    paymentMethod: 'cash',
  });
  return { ledgerEntryId: entry.id, newBalance: entry.balance };
};

const EXECUTORS_BY_KIND = {
  create_invoice: executeCreateInvoiceAction,
  record_payment: executeRecordPaymentAction,
};

/**
 * Executes a `pendingAction` the user clicked Confirm on. Re-validates everything from
 * scratch server-side using the CURRENT request's auth context — never trusts that
 * permissions/entities are still as they were when the preview was built (spec: "The
 * backend must enforce authorization" / "Always validate the final action server-side").
 * `params` are reused exactly as the user saw them in the confirmation card — not re-priced —
 * so what was confirmed is what gets created; only entity existence is re-checked, not price.
 */
const confirmAction = async ({ conversationId, messageId, organizationId, branchId, userId, permissions, isSystemAdmin }) => {
  const message = await getMessageOrThrow({ conversationId, messageId, organizationId, userId });
  const action = message.pendingAction;
  if (!action || action.status !== 'pending') {
    throw new ApiError(httpStatus.CONFLICT, 'This action is no longer pending.');
  }

  if (!hasRequiredPermission(action.kind, permissions, isSystemAdmin)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to complete this action.');
  }

  try {
    const executor = EXECUTORS_BY_KIND[action.kind];
    action.result = await executor(action.params, { organizationId, branchId, userId });
    action.status = 'executed';
    await message.save();
    return message;
  } catch (err) {
    action.status = 'failed';
    action.error = err.message || 'Failed to complete this action.';
    await message.save();
    throw new ApiError(httpStatus.BAD_REQUEST, action.error);
  }
};

const cancelAction = async ({ conversationId, messageId, organizationId, userId }) => {
  const message = await getMessageOrThrow({ conversationId, messageId, organizationId, userId });
  const action = message.pendingAction;
  if (!action || action.status !== 'pending') {
    throw new ApiError(httpStatus.CONFLICT, 'This action is no longer pending.');
  }
  action.status = 'cancelled';
  await message.save();
  return message;
};

module.exports = {
  createConversation,
  listConversations,
  getMessages,
  deleteConversation,
  sendMessage,
  confirmAction,
  cancelAction,
};
