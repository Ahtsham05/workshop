const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const chatService = require('../services/chat.service');
const { uploadAttachmentToCloudinary } = require('../middlewares/attachmentUpload');

// Presence lives in the socket layer; on a process without one (serverless) nobody shows online.
const online = () => {
  try {
    return require('../socket/chat.socket').onlineIds();
  } catch {
    return new Set();
  }
};

const listConversations = catchAsync(async (req, res) => {
  res.send(await chatService.listConversations(req.user, { onlineIds: online() }));
});

const getConversation = catchAsync(async (req, res) => {
  res.send(await chatService.getConversationDetail(req.user, req.params.conversationId, { onlineIds: online() }));
});

const openDirect = catchAsync(async (req, res) => {
  const conversation = await chatService.getOrCreateDirect(req.user, req.body.userId);
  res.status(httpStatus.OK).send({ id: String(conversation._id) });
});

const createGroup = catchAsync(async (req, res) => {
  const conversation = await chatService.createGroup(req.user, req.body);
  res.status(httpStatus.CREATED).send({ id: String(conversation._id) });
});

const updateGroup = catchAsync(async (req, res) => {
  const conversation = await chatService.updateGroup(req.user, req.params.conversationId, req.body);
  res.send({ id: String(conversation._id) });
});

const leaveGroup = catchAsync(async (req, res) => {
  await chatService.leaveGroup(req.user, req.params.conversationId);
  res.status(httpStatus.NO_CONTENT).send();
});

const setPreferences = catchAsync(async (req, res) => {
  res.send(await chatService.setPreferences(req.user, req.params.conversationId, req.body));
});

const listMessages = catchAsync(async (req, res) => {
  res.send(await chatService.listMessages(req.user, req.params.conversationId, req.query));
});

const sendMessage = catchAsync(async (req, res) => {
  const message = await chatService.sendMessage(req.user, req.params.conversationId, req.body, { branchId: req.branchId });
  res.status(httpStatus.CREATED).send(message);
});

const editMessage = catchAsync(async (req, res) => {
  res.send(await chatService.editMessage(req.user, req.params.messageId, req.body));
});

const deleteMessage = catchAsync(async (req, res) => {
  res.send(await chatService.deleteMessage(req.user, req.params.messageId));
});

const react = catchAsync(async (req, res) => {
  res.send(await chatService.toggleReaction(req.user, req.params.messageId, req.body.emoji));
});

const markRead = catchAsync(async (req, res) => {
  res.send(await chatService.markRead(req.user, req.params.conversationId));
});

const unread = catchAsync(async (req, res) => {
  res.send({ total: await chatService.unreadTotal(req.user) });
});

const directory = catchAsync(async (req, res) => {
  res.send(await chatService.listDirectory(req.user, { onlineIds: online() }));
});

const search = catchAsync(async (req, res) => {
  res.send(await chatService.searchMessages(req.user, req.query.q));
});

const productStock = catchAsync(async (req, res) => {
  res.send(await chatService.productStockAcrossBranches(req.user, req.params.productId));
});

const uploadSignature = catchAsync(async (req, res) => {
  res.send(await chatService.uploadSignature(req.user));
});

const uploadAttachment = catchAsync(async (req, res) => {
  await chatService.assertChatUser(req.user);
  if (!req.file) throw new ApiError(httpStatus.BAD_REQUEST, 'No file uploaded');
  let result;
  try {
    result = await uploadAttachmentToCloudinary(req.file.buffer, req.file.mimetype, { folder: `chat/${req.user.organizationId}` });
  } catch (err) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Upload failed: ${err.message}`);
  }
  res.status(httpStatus.CREATED).send({
    url: result.secure_url,
    publicId: result.public_id,
    name: req.file.originalname || '',
    mimeType: req.file.mimetype,
    size: req.file.size,
    width: result.width || null,
    height: result.height || null,
  });
});

module.exports = {
  listConversations,
  getConversation,
  openDirect,
  createGroup,
  updateGroup,
  leaveGroup,
  setPreferences,
  listMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  react,
  markRead,
  unread,
  directory,
  search,
  productStock,
  uploadSignature,
  uploadAttachment,
};
