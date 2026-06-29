const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const aiAssistantValidation = require('../../validations/aiAssistant.validation');
const aiAssistantController = require('../../controllers/aiAssistant.controller');

const router = express.Router();
router.use(auth('viewDashboard'), branchScope());

router
  .route('/conversations')
  .get(aiAssistantController.listConversations)
  .post(validate(aiAssistantValidation.createConversation), aiAssistantController.createConversation);

router
  .route('/conversations/:conversationId')
  .delete(validate(aiAssistantValidation.conversationParams), aiAssistantController.deleteConversation);

router
  .route('/conversations/:conversationId/messages')
  .get(validate(aiAssistantValidation.conversationParams), aiAssistantController.getMessages)
  .post(validate(aiAssistantValidation.sendMessage), aiAssistantController.sendMessage);

module.exports = router;
