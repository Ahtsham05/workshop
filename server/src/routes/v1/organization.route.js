const express = require('express');
const auth = require('../../middlewares/auth');
const organizationController = require('../../controllers/organization.controller');

const router = express.Router();

// POST /v1/organizations/setup — complete onboarding, create org + default branch
router.post('/setup', auth(), organizationController.setupOrganization);

// GET /v1/organizations/me — get organization for current user
router.get('/me', auth(), organizationController.getMyOrganization);

// GET /v1/organizations/:orgId
router.get('/:orgId', auth(), organizationController.getOrganization);

// PATCH /v1/organizations/:orgId
router.patch('/:orgId', auth(), organizationController.updateOrganization);

module.exports = router;
