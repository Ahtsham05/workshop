const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const partnerValidation = require('../../validations/partner.validation');
const partnerController = require('../../controllers/partner.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(auth('createPartners'), validate(partnerValidation.createPartner), partnerController.createPartner)
  .get(auth('viewPartners'), validate(partnerValidation.getPartners), partnerController.getPartners);

router.route('/all').get(auth('viewPartners'), partnerController.getAllPartners);

router
  .route('/:partnerId')
  .get(auth('viewPartners'), validate(partnerValidation.getPartner), partnerController.getPartner)
  .patch(auth('editPartners'), validate(partnerValidation.updatePartner), partnerController.updatePartner)
  .delete(auth('deletePartners'), validate(partnerValidation.deletePartner), partnerController.deletePartner);

module.exports = router;
