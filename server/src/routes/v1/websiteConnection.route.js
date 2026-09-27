const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const websiteConnectionValidation = require('../../validations/websiteConnection.validation');
const websiteConnectionController = require('../../controllers/websiteConnection.controller');

// Managing the shop's website connections (Settings → Website Connections). Org-wide, not
// per branch: a connection names the branches it reads from itself.
const router = express.Router();
router.use(auth('manageWebsiteConnections'));

router
  .route('/')
  .get(websiteConnectionController.listConnections)
  .post(validate(websiteConnectionValidation.createConnection), websiteConnectionController.createConnection);

router
  .route('/:connectionId')
  .patch(validate(websiteConnectionValidation.updateConnection), websiteConnectionController.updateConnection)
  .delete(validate(websiteConnectionValidation.connectionId), websiteConnectionController.deleteConnection);

router.post('/:connectionId/rotate-key', validate(websiteConnectionValidation.connectionId), websiteConnectionController.rotateKey);
router.get('/:connectionId/preview', validate(websiteConnectionValidation.connectionId), websiteConnectionController.previewConnection);

module.exports = router;
