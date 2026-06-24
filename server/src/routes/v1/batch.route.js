const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const batchValidation = require('../../validations/batch.validation');
const batchController = require('../../controllers/batch.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/expiring')
  .get(auth('viewProducts'), validate(batchValidation.getExpiringBatches), batchController.getExpiringBatches);

router
  .route('/variant/:variantId')
  .post(auth('createProducts'), validate(batchValidation.createBatch), batchController.createBatch)
  .get(auth('viewProducts'), validate(batchValidation.getBatches), batchController.getBatches);

router
  .route('/:batchId/write-off')
  .post(auth('editProducts'), validate(batchValidation.writeOffBatch), batchController.writeOffBatch);

module.exports = router;
