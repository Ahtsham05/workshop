const Joi = require('joi');
const { objectId } = require('./custom.validation');
const { CURRENCY_CODES } = require('../config/currencies');
const { COUNTRY_CODES, TAX_SYSTEMS } = require('../config/countries');

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
      // Handled directly by the controller/service, not by this schema — kept permissive
      // (Joi.any()) so the existing logo upload/remove flow via multipart form data is
      // never rejected here.
      logo: Joi.any(),
      removeLogo: Joi.any(),
    })
    .unknown(true),
};

module.exports = {
  updateOrganization,
};
