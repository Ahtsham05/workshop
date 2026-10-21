const express = require('express');
const httpStatus = require('http-status');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const organizationController = require('../../controllers/organization.controller');
const organizationValidation = require('../../validations/organization.validation');
const { upload } = require('../../middlewares/upload');
const { userHasAnyPermission } = require('../../middlewares/permission');
const ApiError = require('../../utils/ApiError');

const router = express.Router();

/**
 * What the Localization, Currency and Document Numbering pages save. A role with
 * manageLocalizationSettings may change these and nothing else on the organization;
 * manageBusinessProfile may change everything.
 */
const LOCALIZATION_FIELDS = [
  'countryCode',
  'baseCurrency',
  'enabledCurrencies',
  'taxSystem',
  'taxInclusivePricingDefault',
  'defaultTaxCategoryId',
  'locale',
  'dateFormat',
  'documentNumbering',
  'nativeLanguage',
];

const canEditOrganization = async (req, res, next) => {
  try {
    if (await userHasAnyPermission(req.user, ['manageBusinessProfile'])) return next();
    const onlyLocalization = !req.file && Object.keys(req.body || {}).every((key) => LOCALIZATION_FIELDS.includes(key));
    if (onlyLocalization && (await userHasAnyPermission(req.user, ['manageLocalizationSettings']))) return next();
    return next(new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to manage business profile.'));
  } catch (error) {
    return next(error);
  }
};

// POST /v1/organizations/setup — complete onboarding, create org + default branch
router.post('/setup', auth(), upload.single('logo'), organizationController.setupOrganization);

// GET /v1/organizations/me — get organization for current user
router.get('/me', auth(), organizationController.getMyOrganization);

// GET /v1/organizations/:orgId
router.get('/:orgId', auth(), organizationController.getOrganization);

// PATCH /v1/organizations/:orgId — manageBusinessProfile, or manageLocalizationSettings for
// the localization fields only (see canEditOrganization).
router.patch(
  '/:orgId',
  auth('manageBusinessProfile', 'manageLocalizationSettings'),
  upload.single('logo'),
  canEditOrganization,
  validate(organizationValidation.updateOrganization),
  organizationController.updateOrganization
);

// Demo data — same permission as the profile PATCH above. GET: remaining sample records +
// running job. reset: wipe + reseed (trial accounts only, checked in the controller).
// remove: wipe without reseeding (any plan).
router.get('/:orgId/demo-data', auth('manageBusinessProfile'), organizationController.getDemoDataStatus);
router.post('/:orgId/demo-data/reset', auth('manageBusinessProfile'), organizationController.resetDemoData);
router.post('/:orgId/demo-data/remove', auth('manageBusinessProfile'), organizationController.removeDemoData);

// POST /v1/organizations/:orgId/document-numbering/preview — non-mutating live preview for
// the Document Numbering settings page. Same permission as the profile PATCH above.
router.post(
  '/:orgId/document-numbering/preview',
  auth('manageBusinessProfile', 'manageLocalizationSettings'),
  validate(organizationValidation.previewDocumentNumbering),
  organizationController.previewDocumentNumbering
);

// PATCH /v1/organizations/:orgId/document-numbering/:docType/next-number — admin
// resume/skip-ahead override for one docType's sequence.
router.patch(
  '/:orgId/document-numbering/:docType/next-number',
  auth('manageBusinessProfile', 'manageLocalizationSettings'),
  validate(organizationValidation.setDocumentNumberingNextNumber),
  organizationController.setDocumentNumberingNextNumber
);

module.exports = router;
