const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const ApiError = require('../../utils/ApiError');
const { attachmentUpload } = require('../../middlewares/attachmentUpload');
const chatValidation = require('../../validations/chat.validation');
const chatController = require('../../controllers/chat.controller');

const router = express.Router();
// No permission gate: every staff member of the organization can talk to every other one,
// the same way everyone gets Notes. Who sees which conversation is decided per thread in
// chat.service.js (branch channels by Membership, direct/group threads by participant).
router.use(auth(), branchScope());

const uploadChatFile = (req, res, next) =>
  attachmentUpload.single('file')(req, res, (err) => {
    if (!err) return next();
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large (10 MB maximum)' : err.message || 'Upload failed';
    return next(new ApiError(400, message));
  });

router.get('/conversations', chatController.listConversations);
router.post('/conversations/direct', validate(chatValidation.openDirect), chatController.openDirect);
router.post('/conversations/group', validate(chatValidation.createGroup), chatController.createGroup);
router.get('/conversations/:conversationId', validate(chatValidation.conversationOnly), chatController.getConversation);
router.patch('/conversations/:conversationId', validate(chatValidation.updateGroup), chatController.updateGroup);
router.post('/conversations/:conversationId/leave', validate(chatValidation.conversationOnly), chatController.leaveGroup);
router.patch(
  '/conversations/:conversationId/preferences',
  validate(chatValidation.setPreferences),
  chatController.setPreferences
);
router.post('/conversations/:conversationId/read', validate(chatValidation.conversationOnly), chatController.markRead);
router
  .route('/conversations/:conversationId/messages')
  .get(validate(chatValidation.listMessages), chatController.listMessages)
  .post(validate(chatValidation.sendMessage), chatController.sendMessage);

router
  .route('/messages/:messageId')
  .patch(validate(chatValidation.editMessage), chatController.editMessage)
  .delete(validate(chatValidation.messageOnly), chatController.deleteMessage);
router.post('/messages/:messageId/reactions', validate(chatValidation.react), chatController.react);

router.get('/unread', chatController.unread);
router.get('/directory', chatController.directory);
router.get('/search', validate(chatValidation.search), chatController.search);
router.get('/products/:productId/stock', validate(chatValidation.productStock), chatController.productStock);
router.post('/attachments', uploadChatFile, chatController.uploadAttachment);

module.exports = router;
