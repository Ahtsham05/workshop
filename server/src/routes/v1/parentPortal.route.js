/**
 * Parent Portal Routes — restricted to users with schoolRole=parent
 * Parents can only see their linked children's data.
 */
const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { parentPortalController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'));

router.get('/children', parentPortalController.getMyChildren);
router.get('/results', parentPortalController.getMyChildResults);
router.get('/attendance', parentPortalController.getMyChildAttendance);
router.get('/fees', parentPortalController.getMyChildFees);
router.get('/report/:studentId', parentPortalController.getMyChildReport);

module.exports = router;
