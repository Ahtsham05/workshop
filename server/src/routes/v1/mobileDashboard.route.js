const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const checkBusinessType = require('../../middlewares/checkBusinessType');
const mobileDashboardController = require('../../controllers/mobileDashboard.controller');

const router = express.Router();

router.use(auth(), branchScope(), checkBusinessType('mobile_shop'));

router.get('/summary', mobileDashboardController.getSummary);

module.exports = router;
