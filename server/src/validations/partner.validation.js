const Joi = require('joi');

const PARTNER_TYPES = ['business_partner', 'product_investor'];

const createPartner = {
  body: Joi.object().keys({
    branchId: Joi.string().allow(null, '').optional(),
    name: Joi.string().required(),
    partnerType: Joi.string().valid(...PARTNER_TYPES).optional(),
    phone: Joi.string().allow('').optional(),
    email: Joi.string().email().allow('').optional(),
    cnic: Joi.string().allow('').optional(),
    address: Joi.string().allow('').optional(),
    isActive: Joi.boolean().optional(),
    notes: Joi.string().allow('').optional(),
  }),
};

const getPartners = {
  query: Joi.object().keys({
    name: Joi.string(),
    partnerType: Joi.string().valid(...PARTNER_TYPES),
    isActive: Joi.boolean(),
    branchId: Joi.string(),
    search: Joi.string(),
    fieldName: Joi.string(),
    limit: Joi.number(),
    page: Joi.number(),
    sortBy: Joi.string(),
  }),
};

const getPartner = {
  params: Joi.object().keys({
    partnerId: Joi.string().required(),
  }),
};

const updatePartner = {
  params: Joi.object().keys({
    partnerId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    branchId: Joi.string().allow(null, '').optional(),
    name: Joi.string().optional(),
    partnerType: Joi.string().valid(...PARTNER_TYPES).optional(),
    phone: Joi.string().allow('').optional(),
    email: Joi.string().email().allow('').optional(),
    cnic: Joi.string().allow('').optional(),
    address: Joi.string().allow('').optional(),
    isActive: Joi.boolean().optional(),
    notes: Joi.string().allow('').optional(),
  }),
};

const deletePartner = {
  params: Joi.object().keys({
    partnerId: Joi.string().required(),
  }),
};

module.exports = {
  createPartner,
  getPartners,
  getPartner,
  updatePartner,
  deletePartner,
};
