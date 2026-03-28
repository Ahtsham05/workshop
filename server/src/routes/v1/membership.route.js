const express = require('express');
const auth = require('../../middlewares/auth');
const membershipController = require('../../controllers/membership.controller');

const router = express.Router();

// GET /v1/memberships/me — current user's memberships
router.get('/me', auth(), membershipController.getMyMemberships);

// GET /v1/memberships/org — all members of the organization
router.get('/org', auth(), membershipController.getMembersByOrg);

// GET /v1/memberships/branch/:branchId — members of a specific branch
router.get('/branch/:branchId', auth(), membershipController.getMembersByBranch);

// POST /v1/memberships/staff — create new staff user and assign to branch
router.post('/staff', auth(), membershipController.createStaff);

// POST /v1/memberships — add existing user to branch
router.post('/', auth(), membershipController.addMember);

// PATCH /v1/memberships/:membershipId/role — update member role
router.patch('/:membershipId/role', auth(), membershipController.updateMemberRole);

// DELETE /v1/memberships/:membershipId — remove member from branch
router.delete('/:membershipId', auth(), membershipController.removeMember);

module.exports = router;
