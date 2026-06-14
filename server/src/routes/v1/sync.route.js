const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const syncValidation = require('../../validations/sync.validation');
const syncController = require('../../controllers/sync.controller');

const router = express.Router();

router.use(auth(), branchScope(true));

router.post('/register-device', validate(syncValidation.registerDevice), syncController.registerDevice);
router.get('/bootstrap', syncController.bootstrap);
router.get('/pull', validate(syncValidation.pull), syncController.pull);
router.post('/push', validate(syncValidation.push), syncController.push);
router.post('/push-http', validate(syncValidation.pushHttp), syncController.pushHttp);
router.get('/prefetch-manifest', syncController.prefetchManifest);
router.get('/conflicts', syncController.listConflicts);
router.post('/conflicts/:conflictId/resolve', validate(syncValidation.resolveConflict), syncController.resolveConflict);

module.exports = router;
