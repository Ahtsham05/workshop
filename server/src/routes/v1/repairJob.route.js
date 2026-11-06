const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkBusinessType = require('../../middlewares/checkBusinessType');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const v = require('../../validations/repairJob.validation');
const c = require('../../controllers/repairJob.controller');

const router = express.Router();

router.use(auth(), branchScope(), checkBusinessType('mobile_shop'), checkFeatureAccess('repair'));

// Named sub-routes BEFORE /:repairJobId
router.get('/stats', auth('viewRepairs'), c.getStats);
router.get('/lookup', auth('viewRepairs'), validate(v.lookupHistory), c.lookupHistory);
router.get('/technicians', auth('viewRepairs'), c.getTechnicians);
router
  .route('/settings')
  .get(auth('viewRepairs'), c.getSettings)
  .put(auth('manageRepairs'), validate(v.updateSettings), c.updateSettings);
router.get('/parts-usage', auth('viewRepairs'), validate(v.getPartsUsage), c.getPartsUsage);

router
  .route('/')
  .post(auth('manageRepairs'), validate(v.createRepairJob), c.createRepairJob)
  .get(auth('viewRepairs'), validate(v.getRepairJobs), c.getRepairJobs);

router
  .route('/:repairJobId')
  .get(auth('viewRepairs'), validate(v.getRepairJob), c.getRepairJob)
  .patch(auth('manageRepairs'), validate(v.updateRepairJob), c.updateRepairJob)
  .delete(auth('manageRepairs'), validate(v.deleteRepairJob), c.deleteRepairJob);

router.post('/:repairJobId/status', auth('manageRepairs'), validate(v.changeStatus), c.changeStatus);
router.post('/:repairJobId/bill', auth('manageRepairs'), validate(v.saveBill), c.saveBill);
router.post('/:repairJobId/items', auth('manageRepairs'), validate(v.addItem), c.addItem);
router.patch('/:repairJobId/items/:itemId', auth('manageRepairs'), validate(v.updateItem), c.updateItem);
router.delete('/:repairJobId/items/:itemId', auth('manageRepairs'), validate(v.removeItem), c.removeItem);
router.post('/:repairJobId/payments', auth('manageRepairs'), validate(v.addPayment), c.addPayment);
router.delete('/:repairJobId/payments/:paymentId', auth('manageRepairs'), validate(v.removePayment), c.removePayment);
router.post('/:repairJobId/notes', auth('manageRepairs'), validate(v.addNote), c.addNote);

module.exports = router;
