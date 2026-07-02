const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const agentBillController = require('../../controllers/agentBill.controller');

const router = express.Router();

router.use(auth(), branchScope());

router.route('/batch').post(agentBillController.createAgentBillsBatch);
router.route('/').get(agentBillController.getAgentBills);
router.route('/:id').delete(agentBillController.deleteAgentBill);

module.exports = router;
