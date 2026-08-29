const Joi = require('joi');

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
    balance: Joi.number().optional(),
    picture: cloudinaryImage,
    idCardFront: cloudinaryImage,
    idCardBack: cloudinaryImage,
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
    balance: Joi.number().optional(),
    picture: nullableCloudinaryImage,
    idCardFront: nullableCloudinaryImage,
    idCardBack: nullableCloudinaryImage,
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

const bulkAddSuppliers = {
  body: Joi.object().keys({
    suppliers: Joi.array().items(
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
  createSupplier,
  getSuppliers,
  getSupplier,
  updateSupplier,
  deleteSupplier,
  bulkUpdateSuppliers,
  bulkDeleteSuppliers,
  bulkAddSuppliers,
};
