const Joi = require('joi');

const cloudinaryImage = Joi.object({
  url: Joi.string().uri().required(),
  publicId: Joi.string().required(),
});

const nullableCloudinaryImage = Joi.alternatives().try(cloudinaryImage, Joi.valid(null));

const createCustomer = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    nameUrdu: Joi.string().allow(''),
    email: Joi.string().email(),
    phone: Joi.string(),
    whatsapp: Joi.string(),
    address: Joi.string(),
    balance: Joi.number().optional(),
    picture: cloudinaryImage,
    idCardFront: cloudinaryImage,
    idCardBack: cloudinaryImage,
  }),
};

const getCustomers = {
  query: Joi.object().keys({
    name: Joi.string(),
    email: Joi.string(),
    phone: Joi.string(),
    limit: Joi.number(),
    page: Joi.number(),
    search: Joi.string(),
    sortBy: Joi.string(),
    fieldName: Joi.string(),
    // Employees get a hidden shadow Customer record so they can be billed
    // through the Invoice screen. Regular customer lists/pickers must not
    // show them unless a caller (e.g. the Invoice customer picker) opts in.
    includeEmployees: Joi.boolean(),
  }),
};

const getCustomer = {
  params: Joi.object().keys({
    customerId: Joi.string().required(),
  }),
};

const updateCustomer = {
  params: Joi.object().keys({
    customerId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    _id: Joi.string(),
    name: Joi.string(),
    nameUrdu: Joi.string().allow(''),
    email: Joi.string().email(),
    phone: Joi.string(),
    whatsapp: Joi.string(),
    address: Joi.string(),
    balance: Joi.number().optional(),
    picture: nullableCloudinaryImage,
    idCardFront: nullableCloudinaryImage,
    idCardBack: nullableCloudinaryImage,
  }),
};

const deleteCustomer = {
  params: Joi.object().keys({
    customerId: Joi.string().required(),
  }),
};

const bulkAddCustomers = {
  body: Joi.object().keys({
    customers: Joi.array().items(
      Joi.object().keys({
        name: Joi.string().required(),
        email: Joi.string().email().allow('').optional(),
        phone: Joi.string().allow('').optional(),
        whatsapp: Joi.string().allow('').optional(),
        address: Joi.string().allow('').optional(),
        balance: Joi.number().optional(),
        nameUrdu: Joi.string().allow('').optional(),
      })
    ).required().min(1)
  }),
};

module.exports = {
  createCustomer,
  getCustomers,
  getCustomer,
  updateCustomer,
  deleteCustomer,
  bulkAddCustomers,
};
