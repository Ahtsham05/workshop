const Joi = require('joi');
const { objectId } = require('./custom.validation');
const { CURRENCY_CODES } = require('../config/currencies');
const { COUNTRY_CODES, TAX_SYSTEMS } = require('../config/countries');

// One section (invoice/purchase/quotation) of the documentNumbering config — see
// organization.model.js's buildNumberingSectionSchema and documentNumbering.service.js's
// assertNumberingConsistency, which this mirrors server-side.
const GRANULARITY = { none: 0, yearly: 1, monthly: 2 };
const numberingSection = Joi.object({
  prefix: Joi.string().trim().max(12).pattern(/^[A-Za-z0-9]*$/).allow(''),
  separator: Joi.string().trim().max(3).allow(''),
  dateSegment: Joi.string().valid('none', 'yearly', 'monthly'),
  resetPeriod: Joi.string().valid('never', 'yearly', 'monthly'),
  padding: Joi.number().integer().min(1).max(10),
  startingNumber: Joi.number().integer().min(1),
}).custom((value) => {
  if (
    value.dateSegment &&
    value.resetPeriod &&
    GRANULARITY[value.resetPeriod] > GRANULARITY[value.dateSegment]
  ) {
    throw new Error('Reset period cannot be more frequent than the date segment');
  }
  return value;
});

const documentNumberingSection = Joi.object({
  invoice: numberingSection,
  purchase: numberingSection,
  quotation: numberingSection,
});

// PATCH /v1/organizations/:orgId is a partial update — every body field is optional here.
// The route also runs `upload.single('logo')` (multipart/form-data), so every field
// (including booleans) arrives as a string on req.body; Joi's default `convert: true`
// coerces 'true'/'false' strings for Joi.boolean(). `logo`/`removeLogo` are handled by the
// controller before the service is called (removeLogo clears the stored logo, req.file
// drives a fresh Cloudinary upload) — kept permissive here so that flow keeps working
// unchanged (see organization.controller.js#updateOrganization).
const updateOrganization = {
  params: Joi.object().keys({
    orgId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string(),
      nameUrdu: Joi.string().allow(''),
      businessType: Joi.string(),
      email: Joi.string().allow(''),
      phone: Joi.string().allow(''),
      address: Joi.string().allow(''),
      city: Joi.string().allow(''),
      country: Joi.string().allow(''),
      countryCode: Joi.string()
        .uppercase()
        .valid(...COUNTRY_CODES)
        .allow(null, ''),
      taxNumber: Joi.string().allow(''),
      website: Joi.string().allow(''),
      description: Joi.string().allow(''),
      baseCurrency: Joi.string()
        .uppercase()
        .valid(...CURRENCY_CODES)
        .allow(null, ''),
      enabledCurrencies: Joi.array().items(
        Joi.string()
          .uppercase()
          .valid(...CURRENCY_CODES)
      ),
      taxSystem: Joi.string().valid(...TAX_SYSTEMS),
      taxInclusivePricingDefault: Joi.boolean(),
      defaultTaxCategoryId: Joi.string().custom(objectId).allow(null, ''),
      locale: Joi.string().allow(''),
      dateFormat: Joi.string().valid('DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'),
      documentNumbering: documentNumberingSection,
      // Handled directly by the controller/service, not by this schema — kept permissive
      // (Joi.any()) so the existing logo upload/remove flow via multipart form data is
      // never rejected here.
      logo: Joi.any(),
      removeLogo: Joi.any(),
    })
    .unknown(true),
};

// POST /v1/organizations/:orgId/document-numbering/preview — non-mutating "what would the
// next number look like" check for the Document Numbering settings page's live preview.
// `config` is a draft (not-yet-saved) section; omitted, it previews the org's real config.
const previewDocumentNumbering = {
  params: Joi.object().keys({
    orgId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    docType: Joi.string().valid('invoice', 'purchase', 'quotation').required(),
    config: numberingSection,
  }),
};

// PATCH /v1/organizations/:orgId/document-numbering/:docType/next-number — admin "resume/
// skip-ahead" action; rejected server-side if it would collide with an already-issued number.
const setDocumentNumberingNextNumber = {
  params: Joi.object().keys({
    orgId: Joi.string().custom(objectId).required(),
    docType: Joi.string().valid('invoice', 'purchase', 'quotation').required(),
  }),
  body: Joi.object().keys({
    nextNumber: Joi.number().integer().min(1).required(),
  }),
};

module.exports = {
  updateOrganization,
  previewDocumentNumbering,
  setDocumentNumberingNextNumber,
};
