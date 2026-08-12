const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const communicationLogValidation = require('../../validations/communicationLog.validation');
const communicationLogController = require('../../controllers/communicationLog.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(auth('createCommunicationLog'), validate(communicationLogValidation.createLog), communicationLogController.createLog)
  .get(auth('viewCommunicationLog'), validate(communicationLogValidation.getLogs), communicationLogController.getLogs);

router
  .route('/:id')
  .get(auth('viewCommunicationLog'), validate(communicationLogValidation.getLog), communicationLogController.getLog)
  .patch(auth('editCommunicationLog'), validate(communicationLogValidation.updateLog), communicationLogController.updateLog)
  .delete(auth('deleteCommunicationLog'), validate(communicationLogValidation.deleteLog), communicationLogController.deleteLog);

module.exports = router;
