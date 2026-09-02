const Joi = require('joi');

// validFrom is optional on both create and update (it defaults to Date.now on the model
// when omitted on create — see taxExemption.model.js), so a bare, unconditional
// .min(Joi.ref('validFrom')) would error outright whenever validTo is sent without
// validFrom in the same request (Joi does NOT silently skip a .min(ref) check whose
// reference resolves to undefined). Only enforce the ordering when both fields are
// present in the same request.
const validToSchema = Joi.date()
  .allow(null)
  .when('validFrom', {
    is: Joi.exist(),
    then: Joi.date().min(Joi.ref('validFrom')).messages({ 'date.min': '"validTo" must not be before "validFrom"' }),
  });

const createTaxExemption = {
  body: Joi.object().keys({
    customerId: Joi.string().required(),
    taxCategoryId: Joi.string().allow(null).optional(),
    exemptionType: Joi.string().allow('').optional(),
    certificateNumber: Joi.string().allow('').optional(),
    certificateDocument: Joi.object()
      .keys({
        url: Joi.string(),
        publicId: Joi.string(),
      })
      .optional(),
    reason: Joi.string().allow('').optional(),
    validFrom: Joi.date().optional(),
    validTo: validToSchema.optional(),
    status: Joi.string().valid('active', 'inactive').optional(),
  }),
};

const getTaxExemptions = {
  query: Joi.object().keys({
    customerId: Joi.string(),
    taxCategoryId: Joi.string(),
    status: Joi.string().valid('active', 'inactive'),
    sortBy: Joi.string(),
    limit: Joi.number(),
    page: Joi.number(),
    search: Joi.string(),
    fieldName: Joi.string(),
  }),
};

const getTaxExemption = {
  params: Joi.object().keys({
    taxExemptionId: Joi.string().required(),
  }),
};

const updateTaxExemption = {
  params: Joi.object().keys({
    taxExemptionId: Joi.string().required(),
  }),
  body: Joi.object()
    .keys({
      customerId: Joi.string(),
      taxCategoryId: Joi.string().allow(null),
      exemptionType: Joi.string().allow(''),
      certificateNumber: Joi.string().allow(''),
      certificateDocument: Joi.object().keys({
        url: Joi.string(),
        publicId: Joi.string(),
      }),
      reason: Joi.string().allow(''),
      validFrom: Joi.date(),
      validTo: validToSchema,
      status: Joi.string().valid('active', 'inactive'),
    })
    .min(1),
};

const deleteTaxExemption = {
  params: Joi.object().keys({
    taxExemptionId: Joi.string().required(),
  }),
};

module.exports = {
  createTaxExemption,
  getTaxExemptions,
  getTaxExemption,
  updateTaxExemption,
  deleteTaxExemption,
};
