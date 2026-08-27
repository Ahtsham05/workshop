const Joi = require('joi');

const cloudinaryImage = Joi.object({
  url: Joi.string().uri().required(),
  publicId: Joi.string().required(),
});

const nullableCloudinaryImage = Joi.alternatives().try(cloudinaryImage, Joi.valid(null));

const customerType = Joi.string().valid('retail', 'wholesale', 'vip', 'corporate').allow('');
const paymentTerms = Joi.string().valid('cash', 'due_on_receipt', 'net_15', 'net_30', 'net_60').allow('');

const createCustomer = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    nameUrdu: Joi.string().allow(''),
    email: Joi.string().email().allow(''),
    phone: Joi.string().allow(''),
    whatsapp: Joi.string().allow(''),
    address: Joi.string().allow(''),
    balance: Joi.number().optional(),
    picture: cloudinaryImage,
    idCardFront: cloudinaryImage,
    idCardBack: cloudinaryImage,
    customerType,
    creditLimit: Joi.number().optional(),
    paymentTerms,
    taxNumber: Joi.string().allow(''),
    notes: Joi.string().allow(''),
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
    // Same pattern for suppliers who can also be billed as a customer.
    includeSuppliers: Joi.boolean(),
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
    email: Joi.string().email().allow(''),
    phone: Joi.string().allow(''),
    whatsapp: Joi.string().allow(''),
    address: Joi.string().allow(''),
    balance: Joi.number().optional(),
    picture: nullableCloudinaryImage,
    idCardFront: nullableCloudinaryImage,
    idCardBack: nullableCloudinaryImage,
    customerType,
    creditLimit: Joi.number().optional(),
    paymentTerms,
    taxNumber: Joi.string().allow(''),
    notes: Joi.string().allow(''),
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
