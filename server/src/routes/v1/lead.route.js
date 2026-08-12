const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const leadValidation = require('../../validations/lead.validation');
const leadController = require('../../controllers/lead.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(auth('createLeads'), validate(leadValidation.createLead), leadController.createLead)
  .get(auth('viewLeads'), validate(leadValidation.getLeads), leadController.getLeads);

router.route('/stats').get(auth('viewLeads'), leadController.getStats);

router
  .route('/check-duplicate')
  .get(auth('createLeads'), validate(leadValidation.checkDuplicates), leadController.checkDuplicates);

router
  .route('/by-customer/:customerId')
  .get(auth('viewLeads'), validate(leadValidation.getByCustomer), leadController.getByCustomer);

router
  .route('/:id')
  .get(auth('viewLeads'), validate(leadValidation.getLead), leadController.getLead)
  .patch(auth('editLeads'), validate(leadValidation.updateLead), leadController.updateLead)
  .delete(auth('deleteLeads'), validate(leadValidation.deleteLead), leadController.deleteLead);

router
  .route('/:id/stage')
  .post(auth('editLeads'), validate(leadValidation.changeStage), leadController.changeStage);

router
  .route('/:id/convert')
  .post(auth('convertLeads'), validate(leadValidation.convertLead), leadController.convertLead);

router
  .route('/:id/timeline')
  .get(auth('viewLeads'), validate(leadValidation.getLead), leadController.getTimeline);

module.exports = router;
