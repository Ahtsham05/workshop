const Joi = require('joi');

// effectiveFrom is always required on create, so the sibling ref is always present and
// this can be a plain unconditional .min(ref) check.
const effectiveToOnCreate = Joi.date()
  .allow(null)
  .min(Joi.ref('effectiveFrom'))
  .messages({ 'date.min': '"effectiveTo" must not be before "effectiveFrom"' });

// On a partial update effectiveFrom may be omitted; a bare .min(Joi.ref('effectiveFrom'))
// errors outright when the ref resolves to undefined (it does NOT silently skip the
// check), which would wrongly reject a legitimate "just update effectiveTo" PATCH. Only
// enforce the ordering when both fields are present in the same request.
const effectiveToOnUpdate = Joi.date()
  .allow(null)
  .when('effectiveFrom', {
    is: Joi.exist(),
    then: Joi.date().min(Joi.ref('effectiveFrom')).messages({ 'date.min': '"effectiveTo" must not be before "effectiveFrom"' }),
  });

const createTaxRate = {
  body: Joi.object().keys({
    taxCategoryId: Joi.string().required(),
    taxJurisdictionId: Joi.string().allow(null).optional(),
    name: Joi.string().required(),
    rateType: Joi.string().valid('PERCENTAGE', 'FIXED').optional(),
    rate: Joi.number().min(0).required(),
    isCompound: Joi.boolean().optional(),
    priority: Joi.number().optional(),
    effectiveFrom: Joi.date().required(),
    effectiveTo: effectiveToOnCreate.optional(),
    status: Joi.string().valid('active', 'inactive').optional(),
  }),
};

const getTaxRates = {
  query: Joi.object().keys({
    taxCategoryId: Joi.string(),
    taxJurisdictionId: Joi.string(),
    status: Joi.string().valid('active', 'inactive'),
    sortBy: Joi.string(),
    limit: Joi.number(),
    page: Joi.number(),
    search: Joi.string(),
    fieldName: Joi.string(),
  }),
};

const getTaxRate = {
  params: Joi.object().keys({
    taxRateId: Joi.string().required(),
  }),
};

const updateTaxRate = {
  params: Joi.object().keys({
    taxRateId: Joi.string().required(),
  }),
  body: Joi.object()
    .keys({
      taxCategoryId: Joi.string(),
      taxJurisdictionId: Joi.string().allow(null),
      name: Joi.string(),
      rateType: Joi.string().valid('PERCENTAGE', 'FIXED'),
      rate: Joi.number().min(0),
      isCompound: Joi.boolean(),
      priority: Joi.number(),
      effectiveFrom: Joi.date(),
      effectiveTo: effectiveToOnUpdate,
      status: Joi.string().valid('active', 'inactive'),
    })
    .min(1),
};

const deleteTaxRate = {
  params: Joi.object().keys({
    taxRateId: Joi.string().required(),
  }),
};

module.exports = {
  createTaxRate,
  getTaxRates,
  getTaxRate,
  updateTaxRate,
  deleteTaxRate,
};
