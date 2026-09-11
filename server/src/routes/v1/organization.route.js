const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const organizationController = require('../../controllers/organization.controller');
const organizationValidation = require('../../validations/organization.validation');
const { upload } = require('../../middlewares/upload');

const router = express.Router();

// POST /v1/organizations/setup — complete onboarding, create org + default branch
router.post('/setup', auth(), upload.single('logo'), organizationController.setupOrganization);

// GET /v1/organizations/me — get organization for current user
router.get('/me', auth(), organizationController.getMyOrganization);

// GET /v1/organizations/:orgId
router.get('/:orgId', auth(), organizationController.getOrganization);

// PATCH /v1/organizations/:orgId — requires manageBusinessProfile (was previously any
// authenticated user, letting any account patch any organization's profile by ID).
router.patch(
  '/:orgId',
  auth('manageBusinessProfile'),
  upload.single('logo'),
  validate(organizationValidation.updateOrganization),
  organizationController.updateOrganization
);

// POST /v1/organizations/:orgId/demo-data/reset — wipe + reseed this trial org's sample
// data. Same permission as the profile PATCH above; further gated to trial accounts only
// in the controller.
router.post('/:orgId/demo-data/reset', auth('manageBusinessProfile'), organizationController.resetDemoData);

module.exports = router;
