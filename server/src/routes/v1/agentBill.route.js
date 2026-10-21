const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const agentBillController = require('../../controllers/agentBill.controller');

const router = express.Router();

router.use(auth(), branchScope());

router.route('/batch').post(auth('manageBillPayments'), agentBillController.createAgentBillsBatch);
router.route('/report').get(auth('viewBillPayments', 'viewReports', 'viewBillPaymentReports'), agentBillController.getAgentBillReport);
router.route('/').get(auth('viewBillPayments', 'viewReports', 'viewBillPaymentReports'), agentBillController.getAgentBills);
router
  .route('/:id')
  .patch(auth('manageBillPayments'), agentBillController.updateAgentBill)
  .delete(auth('manageBillPayments'), agentBillController.deleteAgentBill);

module.exports = router;
