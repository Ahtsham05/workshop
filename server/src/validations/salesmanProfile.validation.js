const Joi = require('joi');

const createSalesmanProfile = {
  body: Joi.object().keys({
    userId: Joi.string().required(),
    phone: Joi.string().allow('').optional(),
    cnic: Joi.string().allow('').optional(),
    defaultCommissionRate: Joi.number().min(0).max(100).optional(),
    status: Joi.string().valid('active', 'inactive').optional(),
    joiningDate: Joi.date().optional(),
    notes: Joi.string().allow('').optional(),
  }),
};

const getSalesmanProfiles = {
  query: Joi.object().keys({
    status: Joi.string().valid('active', 'inactive'),
    limit: Joi.number(),
    page: Joi.number(),
    sortBy: Joi.string(),
    search: Joi.string(),
    fieldName: Joi.string(),
  }),
};

const getSalesmanProfile = {
  params: Joi.object().keys({
    salesmanProfileId: Joi.string().required(),
  }),
};

const updateSalesmanProfile = {
  params: Joi.object().keys({
    salesmanProfileId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    phone: Joi.string().allow('').optional(),
    cnic: Joi.string().allow('').optional(),
    defaultCommissionRate: Joi.number().min(0).max(100).optional(),
    status: Joi.string().valid('active', 'inactive').optional(),
    joiningDate: Joi.date().optional(),
    notes: Joi.string().allow('').optional(),
  }),
};

const deleteSalesmanProfile = {
  params: Joi.object().keys({
    salesmanProfileId: Joi.string().required(),
  }),
};

module.exports = {
  createSalesmanProfile,
  getSalesmanProfiles,
  getSalesmanProfile,
  updateSalesmanProfile,
  deleteSalesmanProfile,
};
