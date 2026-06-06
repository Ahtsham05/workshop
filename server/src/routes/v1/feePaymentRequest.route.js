const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const { feePaymentRequestController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'), requireSchoolAdmin());

router.get('/', feePaymentRequestController.getRequests);
router.get('/pending-count', feePaymentRequestController.getPendingCount);
router.get('/:id', feePaymentRequestController.getRequest);
router.post('/:id/approve', feePaymentRequestController.approveRequest);
router.post('/:id/reject', feePaymentRequestController.rejectRequest);

module.exports = router;
