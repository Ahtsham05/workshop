const httpStatus = require('http-status');
const { AiConversation, AiMessage, Organization, Customer, Product } = require('../models');
const ApiError = require('../utils/ApiError');
const geminiService = require('./aiAssistant/gemini.service');
const invoiceService = require('./invoice.service');

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

/**
 * Looks for a write-tool call that only produced a preview (never a DB write — see
 * tools/actions.js) and turns it into a `pendingAction` for the message to carry, so the
 * frontend can render a Confirm/Cancel card bound to these exact resolved params. Only one
 * pending action per message; if the model called more than one write tool in a turn (it
 * shouldn't, given the system prompt, but never trust that alone), the first wins.
 */
const buildPendingAction = (toolCalls) => {
  const actionCall = toolCalls.find((tc) => tc.name === 'create_invoice' && tc.result && tc.result.status === 'preview');
  if (!actionCall) return undefined;
  const { preview } = actionCall.result;
  return {
    kind: 'create_invoice',
    status: 'pending',
    params: {
      customerId: preview.customerId,
      productId: preview.productId,
      quantity: preview.quantity,
      unitPrice: preview.unitPrice,
      total: preview.total,
    },
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

/**
 * Executes a `pendingAction` the user clicked Confirm on. Re-validates everything from
 * scratch server-side using the CURRENT request's auth context — never trusts that
 * permissions/entities are still as they were when the preview was built (spec: "The
 * backend must enforce authorization" / "Always validate the final action server-side").
 * `params` (customerId/productId/quantity/unitPrice/total) are reused exactly as the user
 * saw them in the confirmation card — not re-priced — so what was confirmed is what gets
 * created; only existence of the customer/product is re-checked, not their current price.
 */
const confirmAction = async ({ conversationId, messageId, organizationId, branchId, userId, permissions, isSystemAdmin }) => {
  const message = await getMessageOrThrow({ conversationId, messageId, organizationId, userId });
  const action = message.pendingAction;
  if (!action || action.status !== 'pending') {
    throw new ApiError(httpStatus.CONFLICT, 'This action is no longer pending.');
  }

  const canCreateInvoices = isSystemAdmin === true || (permissions && permissions.createInvoices === true);
  if (!canCreateInvoices) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to create invoices.');
  }

  const { params } = action;
  const isWalkIn = params.customerId === 'walk-in';
  const [customer, product] = await Promise.all([
    isWalkIn ? Promise.resolve(null) : Customer.findOne({ _id: params.customerId, organizationId }),
    Product.findOne({ _id: params.productId, organizationId }),
  ]);
  if ((!isWalkIn && !customer) || !product) {
    action.status = 'failed';
    action.error = !isWalkIn && !customer ? 'That customer no longer exists.' : 'That product no longer exists.';
    await message.save();
    throw new ApiError(httpStatus.BAD_REQUEST, action.error);
  }

  try {
    const invoice = await invoiceService.createInvoice(
      {
        organizationId,
        branchId,
        customerId: params.customerId,
        type: 'cash',
        paymentMethod: 'cash',
        items: [
          {
            productId: params.productId,
            name: product.name,
            quantity: params.quantity,
            unitPrice: params.unitPrice,
            subtotal: params.total,
          },
        ],
        subtotal: params.total,
        total: params.total,
        totalProfit: 0,
        totalCost: 0,
      },
      userId
    );

    action.status = 'executed';
    action.result = { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber };
    await message.save();
    return message;
  } catch (err) {
    action.status = 'failed';
    action.error = err.message || 'Failed to create the invoice.';
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
