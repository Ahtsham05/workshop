const Joi = require('joi');

const createSalesmanProfile = {
  body: Joi.object()
    .keys({
      userId: Joi.string().optional().allow(null, ''),
      name: Joi.string().trim().optional().allow(''),
      phone: Joi.string().allow('').optional(),
      cnic: Joi.string().allow('').optional(),
      defaultCommissionRate: Joi.number().min(0).max(100).optional(),
      status: Joi.string().valid('active', 'inactive').optional(),
      joiningDate: Joi.date().optional(),
      notes: Joi.string().allow('').optional(),
    })
    .or('userId', 'name')
    .messages({ 'object.missing': 'Either userId or name is required' }),
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
    name: Joi.string().trim().allow('').optional(),
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
