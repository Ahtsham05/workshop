const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const paymentValidation = require('../../validations/payment.validation');
const adminController = require('../../controllers/admin.controller');
const { checkSystemAdmin } = require('../../middlewares/subscription');
const signupLeadValidation = require('../../validations/signupLead.validation');
const impersonationValidation = require('../../validations/impersonation.validation');
const signupLeadController = require('../../controllers/signupLead.controller');
const adminActivationValidation = require('../../validations/adminActivation.validation');

const router = express.Router();

// All /v1/admin routes require JWT auth + system_admin role
router.use(auth(), checkSystemAdmin);

// GET /v1/admin/dashboard — platform stats
router.get('/dashboard', adminController.getDashboard);

// GET /v1/admin/organizations — search / filter / sort / page every org, with owner,
// effective subscription status, usage and sales-lead stage
router.get('/organizations', validate(signupLeadValidation.listOrganizations), signupLeadController.listOrganizations);

// ── Trial signup sales pipeline (platform leads) ──
router.get('/leads', validate(signupLeadValidation.getPipeline), signupLeadController.getPipeline);
router.get('/leads/alerts', signupLeadController.getAlerts);
router.post('/leads/acknowledge', validate(signupLeadValidation.acknowledge), signupLeadController.acknowledge);
router.get('/leads/:orgId', validate(signupLeadValidation.getLead), signupLeadController.getLead);
router.patch('/leads/:orgId', validate(signupLeadValidation.updateLead), signupLeadController.updateLead);
router.post('/leads/:orgId/activities', validate(signupLeadValidation.addActivity), signupLeadController.addActivity);
router.post('/leads/:orgId/snooze', validate(signupLeadValidation.snooze), signupLeadController.snooze);
router.post('/leads/:orgId/playbook/:key', validate(signupLeadValidation.setTouchpoint), signupLeadController.setTouchpoint);

// Bulk clean-up preview (orgs in a bucket, e.g. expired trials) + audit log of deletions.
// Declared before /organizations/:orgId so the literal paths aren't captured as an id.
router.get('/organizations/purge-candidates', adminController.getPurgeCandidates);
router.get('/organizations/deleted', adminController.getDeletedOrganizations);

// Activate / renew / change an org's plan directly (no customer payment claim needed),
// optionally recording money received as an approved payment with a receipt.
router.get('/organizations/:orgId/activation', validate(adminActivationValidation.getOptions), adminController.getActivationOptions);
router.get('/organizations/:orgId/activation/preview', validate(adminActivationValidation.preview), adminController.previewActivation);
router.post('/organizations/:orgId/activation', validate(adminActivationValidation.activate), adminController.activatePlan);

// PATCH /v1/admin/organizations/:orgId/business-type — one-click business type switch
// (org + all its users; logged on the org's sales-lead history)
router.patch(
  '/organizations/:orgId/business-type',
  validate(adminActivationValidation.setBusinessType),
  adminController.setBusinessType
);

// GET /v1/admin/organizations/:orgId — single org with billing detail
router.get('/organizations/:orgId', adminController.getOrganization);

// DELETE /v1/admin/organizations/:orgId[?expectBucket=trial_expired] — back up, then delete the org,
// every record it owns and its users (shared accounts / system admins are only detached)
router.delete('/organizations/:orgId', adminController.deleteOrganization);

// POST /v1/admin/organizations/:orgId/clear-data — wipe business data, keep org/users/subscription
router.post('/organizations/:orgId/clear-data', adminController.clearOrganizationData);

// GET /v1/admin/users — list all users across organizations
router.get('/users', adminController.getAllUsers);

// DELETE /v1/admin/users/:userId — delete user as system admin
router.delete('/users/:userId', adminController.deleteUser);

// ── "Login as user" support sessions (time-limited, logged, revocable) ──
router.post('/users/:userId/impersonate', validate(impersonationValidation.start), adminController.impersonateUser);
router.get('/impersonations', validate(impersonationValidation.list), adminController.listImpersonations);
router.post('/impersonations/:sessionId/end', validate(impersonationValidation.end), adminController.endImpersonation);

// PATCH /v1/admin/users/:userId/password — change user password (system_admin only)
router.patch('/users/:userId/password', adminController.changeUserPassword);

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
