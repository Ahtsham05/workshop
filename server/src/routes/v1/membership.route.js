const express = require('express');
const Joi = require('joi');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const { checkPermission } = require('../../middlewares/permission');
const { objectId } = require('../../validations/custom.validation');
const membershipController = require('../../controllers/membership.controller');

const router = express.Router();

// Only ordinary branch roles can be handed out here; the owner's superAdmin
// membership is created by onboarding and never through this API.
const branchRole = Joi.string().valid('branchAdmin', 'staff');
const v = {
  branch: { params: Joi.object().keys({ branchId: Joi.string().required().custom(objectId) }) },
  membership: { params: Joi.object().keys({ membershipId: Joi.string().required().custom(objectId) }) },
  createStaff: {
    body: Joi.object().keys({
      name: Joi.string().required(),
      email: Joi.string().required().email(),
      password: Joi.string().required(),
      branchId: Joi.string().required().custom(objectId),
      role: branchRole,
    }),
  },
  addMember: {
    body: Joi.object().keys({
      userId: Joi.string().required().custom(objectId),
      branchId: Joi.string().required().custom(objectId),
      role: branchRole,
    }),
  },
  updateRole: {
    params: Joi.object().keys({ membershipId: Joi.string().required().custom(objectId) }),
    body: Joi.object().keys({ role: branchRole.required() }),
  },
};

const canView = checkPermission('viewUsers', 'viewStaff');
const canManage = checkPermission('editUsers', 'manageStaff');

// GET /v1/memberships/me — current user's memberships
router.get('/me', auth(), membershipController.getMyMemberships);

// GET /v1/memberships/org — all members of the organization
router.get('/org', auth(), canView, membershipController.getMembersByOrg);

// GET /v1/memberships/branch/:branchId — members of a specific branch
router.get('/branch/:branchId', auth(), canView, validate(v.branch), membershipController.getMembersByBranch);

// POST /v1/memberships/staff — create new staff user and assign to branch
router.post(
  '/staff',
  auth(),
  checkPermission('createUsers', 'manageStaff'),
  validate(v.createStaff),
  membershipController.createStaff
);

// POST /v1/memberships — add existing user to branch
router.post('/', auth(), canManage, validate(v.addMember), membershipController.addMember);

// PATCH /v1/memberships/:membershipId/role — update member role
router.patch('/:membershipId/role', auth(), canManage, validate(v.updateRole), membershipController.updateMemberRole);

// DELETE /v1/memberships/:membershipId — remove member from branch
router.delete('/:membershipId', auth(), canManage, validate(v.membership), membershipController.removeMember);

module.exports = router;
