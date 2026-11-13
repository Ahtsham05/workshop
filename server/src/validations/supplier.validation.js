const Joi = require('joi');

// City / State / Country (wholesale & distributor forms). Merged into the saved
// billingAddress server-side, so a partial patch never wipes line1/postalCode.
const billingAddress = Joi.object({
  line1: Joi.string().allow('', null),
  line2: Joi.string().allow('', null),
  city: Joi.string().allow('', null),
  state: Joi.string().allow('', null),
  postalCode: Joi.string().allow('', null),
  countryCode: Joi.string().allow('', null),
});

const cloudinaryImage = Joi.object({
  url: Joi.string().uri().required(),
  publicId: Joi.string().required(),
});

const nullableCloudinaryImage = Joi.alternatives().try(cloudinaryImage, Joi.valid(null));

const createSupplier = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    nameUrdu: Joi.string().allow(''),
    email: Joi.string().allow('').optional().default(""),
    phone: Joi.string().allow('').optional(),
    whatsapp: Joi.string().allow('').optional(),
    address: Joi.string().allow('').optional(),
    billingAddress: billingAddress.optional(),
    balance: Joi.number().optional(),
    picture: cloudinaryImage,
    idCardFront: cloudinaryImage,
    idCardBack: cloudinaryImage,
    taxNumber: Joi.string().allow('').optional(),
    isActive: Joi.boolean().optional(),
  }),
};

const getSuppliers = {
  query: Joi.object().keys({
    name: Joi.string(),
    email: Joi.string(),
    phone: Joi.string(),
    isActive: Joi.boolean(),
    limit: Joi.number(),
    page: Joi.number(),
    sortBy: Joi.string(),
    search: Joi.string(),
    fieldName: Joi.string(),
  }),
};

const getSupplier = {
  params: Joi.object().keys({
    supplierId: Joi.string().required(),
  }),
};

const updateSupplier = {
  params: Joi.object().keys({
    supplierId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    _id: Joi.string(),
    name: Joi.string(),
    nameUrdu: Joi.string().allow(''),
    email: Joi.string().email().allow(''),
    phone: Joi.string().allow(''),
    whatsapp: Joi.string().allow(''),
    address: Joi.string().allow(''),
    billingAddress: billingAddress.optional(),
    balance: Joi.number().optional(),
    picture: nullableCloudinaryImage,
    idCardFront: nullableCloudinaryImage,
    idCardBack: nullableCloudinaryImage,
    taxNumber: Joi.string().allow('').optional(),
    isActive: Joi.boolean().optional(),
  }),
};

const deleteSupplier = {
  params: Joi.object().keys({
    supplierId: Joi.string().required(),
  }),
};

const bulkUpdateSuppliers = {
  body: Joi.object().keys({
    suppliers: Joi.array().items(
      Joi.object().keys({
        id: Joi.string().required(),
        isActive: Joi.boolean().optional(),
      })
    ).required().min(1)
  }),
};

const bulkDeleteSuppliers = {
  body: Joi.object().keys({
    ids: Joi.array().items(Joi.string()).required().min(1),
  }),
};

// Shape-only, for the same reason as customer.validation.js#bulkAddCustomers: one bad
// row must cost that row, not the whole upload. Per-row rules live in
// supplier.service.js#bulkAddSuppliers.
const bulkAddSuppliers = {
  body: Joi.object().keys({
    duplicateStrategy: Joi.string().valid('skip', 'update', 'error', 'location').optional(),
    openingBalanceDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null).optional(),
    suppliers: Joi.array().items(
      Joi.object().keys({
        name: Joi.any(),
        nameUrdu: Joi.any(),
        email: Joi.any(),
        phone: Joi.any(),
        whatsapp: Joi.any(),
        address: Joi.any(),
        city: Joi.any(),
        state: Joi.any(),
        country: Joi.any(),
        balance: Joi.any(),
        taxNumber: Joi.any(),
      }).unknown(true)
    ).required().min(1)
  }),
};

module.exports = {
  createSupplier,
  getSuppliers,
  getSupplier,
  updateSupplier,
  deleteSupplier,
  bulkUpdateSuppliers,
  bulkDeleteSuppliers,
  bulkAddSuppliers,
};
