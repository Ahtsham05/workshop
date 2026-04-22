const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkBusinessType = require('../../middlewares/checkBusinessType');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const v = require('../../validations/repairStockItem.validation');
const c = require('../../controllers/repairStockItem.controller');

const router = express.Router();
router.use(auth(), branchScope(), checkBusinessType('mobile_shop'), checkFeatureAccess('repair'));

// Named sub-routes BEFORE /:itemId
router.get('/summary', c.getLedgerSummary);
router.post('/use', validate(v.createUsage), c.createUsage);

router.route('/')
  .get(validate(v.getLedger), c.getLedger)
  .post(validate(v.createPurchase), c.createPurchase);

router.route('/:itemId')
  .delete(validate(v.deleteEntry), c.deleteEntry);

module.exports = router;
