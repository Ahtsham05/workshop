const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const masterProductValidation = require('../../validations/masterProduct.validation');
const masterProductController = require('../../controllers/masterProduct.controller');

const router = express.Router();
router.use(auth(), branchScope());

// Importing = creating a Product at this branch, so both routes reuse the existing
// createProducts permission rather than introducing a new one.
router
  .route('/importable')
  .get(auth('createProducts'), validate(masterProductValidation.getImportableMasterProducts), masterProductController.getImportableMasterProducts);

router
  .route('/import')
  .post(auth('createProducts'), validate(masterProductValidation.importMasterProducts), masterProductController.importMasterProducts);

module.exports = router;
