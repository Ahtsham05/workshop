const express = require('express');
const auth = require('../../middlewares/auth');
const systemController = require('../../controllers/system.controller');

const router = express.Router();

router.use(auth());

router.get('/database-health', systemController.databaseHealth);

module.exports = router;
