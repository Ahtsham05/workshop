const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const stockAdjustmentValidation = require('../../validations/stockAdjustment.validation');
const stockAdjustmentController = require('../../controllers/stockAdjustment.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(
    auth('editProducts'),
    validate(stockAdjustmentValidation.createAdjustment),
    stockAdjustmentController.createAdjustment
  )
  .get(auth('viewProducts'), validate(stockAdjustmentValidation.getAdjustments), stockAdjustmentController.getAdjustments);

// Must be registered before '/:adjustmentId' so 'stats' isn't parsed as an id.
router
  .route('/stats')
  .get(
    auth('viewProducts'),
    validate(stockAdjustmentValidation.getAdjustmentStats),
    stockAdjustmentController.getAdjustmentStats
  );

router
  .route('/:adjustmentId')
  .get(auth('viewProducts'), validate(stockAdjustmentValidation.getAdjustment), stockAdjustmentController.getAdjustment);

router
  .route('/:adjustmentId/reverse')
  .post(
    auth('editProducts'),
    validate(stockAdjustmentValidation.reverseAdjustment),
    stockAdjustmentController.reverseAdjustment
  );

module.exports = router;
