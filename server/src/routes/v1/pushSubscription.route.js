const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { pushSubscriptionValidation } = require('../../validations');
const { pushSubscriptionController } = require('../../controllers');

const router = express.Router();

router.use(auth(), branchScope(false), checkFeatureAccess('school_management'));

router.get('/vapid-public-key', pushSubscriptionController.getVapidPublicKey);
router.post('/subscribe', validate(pushSubscriptionValidation.subscribe), pushSubscriptionController.subscribe);
router.post('/unsubscribe', validate(pushSubscriptionValidation.unsubscribe), pushSubscriptionController.unsubscribe);

module.exports = router;
