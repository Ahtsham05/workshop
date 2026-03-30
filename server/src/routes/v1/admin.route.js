const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const paymentValidation = require('../../validations/payment.validation');
const adminController = require('../../controllers/admin.controller');
const { checkSystemAdmin } = require('../../middlewares/subscription');

const router = express.Router();

// All /v1/admin routes require JWT auth + system_admin role
router.use(auth(), checkSystemAdmin);

// GET /v1/admin/dashboard — platform stats
router.get('/dashboard', adminController.getDashboard);

// GET /v1/admin/organizations — list all orgs
router.get('/organizations', adminController.getAllOrganizations);

// GET /v1/admin/organizations/:orgId — single org with billing detail
router.get('/organizations/:orgId', adminController.getOrganization);

// DELETE /v1/admin/organizations/:orgId — delete organization and all data
router.delete('/organizations/:orgId', adminController.deleteOrganization);

// GET /v1/admin/users — list all users across organizations
router.get('/users', adminController.getAllUsers);

// DELETE /v1/admin/users/:userId — delete user as system admin
router.delete('/users/:userId', adminController.deleteUser);

// GET /v1/admin/payments — all payment requests (filterable by status)
router.get('/payments', validate(paymentValidation.getPayments), adminController.getAllPayments);

// GET /v1/admin/payments/:paymentId
router.get(
  '/payments/:paymentId',
  validate(paymentValidation.getPayment),
  adminController.getPayment
);

// PATCH /v1/admin/payments/:paymentId/approve
router.patch(
  '/payments/:paymentId/approve',
  validate(paymentValidation.approvePayment),
  adminController.approvePayment
);

// PATCH /v1/admin/payments/:paymentId/reject
router.patch(
  '/payments/:paymentId/reject',
  validate(paymentValidation.rejectPayment),
  adminController.rejectPayment
);

module.exports = router;
