const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const translateValidation = require('../../validations/translate.validation');
const translateController = require('../../controllers/translate.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/name-to-urdu')
  .post(
    validate(translateValidation.translateNameToUrdu),
    translateController.translateNameToUrdu,
  );

module.exports = router;
