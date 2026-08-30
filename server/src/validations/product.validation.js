const Joi = require('joi');

const unitConversionSchema = Joi.object().keys({
  fromUnit: Joi.string().required(),
  toUnit: Joi.string().required(),
  factor: Joi.number().positive().required(),
  businessTypes: Joi.array().items(Joi.string()).optional(),
  isActive: Joi.boolean().optional(),
});

// A product tracks per-unit identifiers one way or the other, never both — one physical unit
// has one identifying number in this system (an IMEI for phones, a serial number otherwise).
const noBothImeiAndSerial = (value, helpers) => {
  if (value.trackImei && value.trackSerial) {
    return helpers.message('trackImei and trackSerial cannot both be enabled on the same product');
  }
  return value;
};

// Each entry is either a plain IMEI string, or a { imei, imei2 } pair for dual-SIM phones.
const imeiEntry = Joi.alternatives().try(
  Joi.string().trim(),
  Joi.object().keys({
    imei: Joi.string().trim().required(),
    imei2: Joi.string().trim().allow('').optional(),
  }),
);

const createProduct = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    nameUrdu: Joi.string().allow('').optional(),
    price: Joi.number().required(),
    cost: Joi.number().required(),
    stockQuantity: Joi.number().required(),
    sku: Joi.string().allow('').default(null),
    category: Joi.string().allow('').default(null),
    categories: Joi.array().items(
      Joi.object().keys({
        _id: Joi.string().required(),
        name: Joi.string().required(),
        image: Joi.object().keys({
          url: Joi.string(),
          publicId: Joi.string(),
        }).optional(),
      })
    ).default([]),
    subCategories: Joi.array().items(
      Joi.object().keys({
        _id: Joi.string().required(),
        name: Joi.string().required(),
        image: Joi.object().keys({
          url: Joi.string(),
          publicId: Joi.string(),
        }).optional(),
      })
    ).default([]),
    supplier: Joi.string().allow('').default(null),
    description: Joi.string().allow('').optional(),
    barcode: Joi.string().allow('').optional(),
    trackImei: Joi.boolean().optional(),
    trackSerial: Joi.boolean().optional(),
    warrantyMonths: Joi.number().integer().min(0).optional(),
    imeis: Joi.array().items(imeiEntry).optional(),
    image: Joi.object().keys({
      url: Joi.string(),
      publicId: Joi.string(),
    }).optional(),
    unit: Joi.string().allow('').optional(),
    unitConversions: Joi.array().items(unitConversionSchema).optional(),
    hasVariants: Joi.boolean().optional(),
    trackBatch: Joi.boolean().optional(),
    trackExpiry: Joi.boolean().optional(),
    batchNumber: Joi.string().allow('').optional(),
    expiryDate: Joi.string().allow('').optional(),
    brandId: Joi.string().allow('', null).optional(),
    tags: Joi.array().items(Joi.string().trim().allow('')).optional(),
    color: Joi.string().trim().allow('', null).optional(),
    shelfLocation: Joi.string().trim().allow('').optional(),
    isActive: Joi.boolean().optional(),
  }).custom(noBothImeiAndSerial),
};

const fetchImageFromSearch = {
  body: Joi.object().keys({
    query: Joi.string().trim().min(2).max(200).required(),
  }),
};

const getProducts = {
  query: Joi.object().keys({
    name: Joi.string(),
    category: Joi.string(),
    isActive: Joi.boolean(),
    sortBy: Joi.string(),
    limit: Joi.number(),
    page: Joi.number(),
    search: Joi.string(),
    fieldName: Joi.string(),
  }),
};

const getAllProducts = {}

const getProductStats = {
  query: Joi.object().keys({
    category: Joi.string(),
  }),
};

const getProduct = {
  params: Joi.object().keys({
    productId: Joi.string().required(),
  }),
};

const getProductBranchAvailability = {
  params: Joi.object().keys({
    productId: Joi.string().required(),
  }),
  query: Joi.object().keys({
    variantId: Joi.string(),
  }),
};

const updateProduct = {
  params: Joi.object().keys({
    productId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    _id: Joi.string(),
    name: Joi.string(),
    nameUrdu: Joi.string().allow('').optional(),
    price: Joi.number(),
    description: Joi.string().allow(''),
    barcode: Joi.string().allow(''),
    trackImei: Joi.boolean().optional(),
    trackSerial: Joi.boolean().optional(),
    warrantyMonths: Joi.number().integer().min(0).optional(),
    imeis: Joi.array().items(imeiEntry).optional(),
    cost: Joi.number(),
    stockQuantity: Joi.number(),
    sku: Joi.string().allow(''),
    category: Joi.string().allow(''),
    categories: Joi.array().items(
      Joi.object().keys({
        _id: Joi.string().required(),
        name: Joi.string().required(),
        image: Joi.object().keys({
          url: Joi.string(),
          publicId: Joi.string(),
        }).optional(),
      })
    ),
    subCategories: Joi.array().items(
      Joi.object().keys({
        _id: Joi.string().required(),
        name: Joi.string().required(),
        image: Joi.object().keys({
          url: Joi.string(),
          publicId: Joi.string(),
        }).optional(),
      })
    ),
    supplier: Joi.string().allow(''),
    image: Joi.object().keys({
      url: Joi.string(),
      publicId: Joi.string(),
    }).optional(),
    unit: Joi.string().allow(''),
    unitConversions: Joi.array().items(unitConversionSchema),
    hasVariants: Joi.boolean().optional(),
    trackBatch: Joi.boolean().optional(),
    trackExpiry: Joi.boolean().optional(),
    batchNumber: Joi.string().allow('').optional(),
    expiryDate: Joi.string().allow('').optional(),
    brandId: Joi.string().allow('', null).optional(),
    tags: Joi.array().items(Joi.string().trim().allow('')).optional(),
    color: Joi.string().trim().allow('', null).optional(),
    shelfLocation: Joi.string().trim().allow('').optional(),
    isActive: Joi.boolean().optional(),
  }).custom(noBothImeiAndSerial),
};

const deleteProduct = {
  params: Joi.object().keys({
    productId: Joi.string().required(),
  }),
};

const updateProductFlag = {
  params: Joi.object().keys({
    productId: Joi.string().required(),
  }),
  body: Joi.alternatives().try(
    Joi.object().keys({
      clear: Joi.boolean().valid(true).required(),
    }),
    Joi.object().keys({
      color: Joi.string().trim().required(),
      reason: Joi.string().trim().allow('').optional(),
      note: Joi.string().trim().allow('').optional(),
    }),
  ),
};

const getDistinctProductTags = {};

const lookupProductByCode = {
  query: Joi.object().keys({
    code: Joi.string().trim().min(1).required(),
  }),
};

const bulkUpdateProducts = {
  body: Joi.object().keys({
    products: Joi.array().items(
      Joi.object().keys({
        id: Joi.string().required(),
        price: Joi.number().optional(),
        cost: Joi.number().optional(),
        stockQuantity: Joi.number().optional(),
        isActive: Joi.boolean().optional(),
      })
    ).required().min(1)
  }),
};

const bulkDeleteProducts = {
  body: Joi.object().keys({
    ids: Joi.array().items(Joi.string()).required().min(1),
  }),
};

// Deliberately permissive per-field: this validates the *shape* of a bulk-import
// request (an array of row-ish objects), not the content of each row. A real-world
// spreadsheet import routinely has a handful of rows with a missing name, a
// non-numeric price cell, or an extra column Excel added — Joi's array validation
// rejects the ENTIRE request (`abortEarly: false` still 400s the whole batch) the
// moment any single item fails its schema, which would sink a 6000-row import over one
// bad row before productService.bulkAddProducts ever gets a chance to give a specific,
// per-row diagnostic and just skip that row. `.unknown(true)` on the row schema means
// a stray spreadsheet column doesn't 400 the request either.
const bulkAddProducts = {
  body: Joi.object().keys({
    products: Joi.array().items(
      Joi.object().keys({
        name: Joi.any(),
        nameUrdu: Joi.any(),
        price: Joi.any(),
        cost: Joi.any(),
        stockQuantity: Joi.any(),
        barcode: Joi.any(),
        description: Joi.any(),
        category: Joi.any(),
        subCategory: Joi.any(),
        categories: Joi.array().items(
          Joi.object().keys({
            _id: Joi.string().required(),
            name: Joi.string().required(),
            image: Joi.object().keys({
              url: Joi.string(),
              publicId: Joi.string(),
            }).optional(),
          })
        ).optional(),
        subCategories: Joi.array().items(
          Joi.object().keys({
            _id: Joi.string().required(),
            name: Joi.string().required(),
            image: Joi.object().keys({
              url: Joi.string(),
              publicId: Joi.string(),
            }).optional(),
          })
        ).optional(),
        supplier: Joi.any(),
        unit: Joi.any(),
        sku: Joi.any(),
        lowStockThreshold: Joi.any(),
        unitConversions: Joi.array().items(unitConversionSchema).optional(),
      }).unknown(true)
    ).required().min(1)
  }),
};

module.exports = {
  createProduct,
  fetchImageFromSearch,
  getProducts,
  getProduct,
  getProductBranchAvailability,
  updateProduct,
  deleteProduct,
  getAllProducts,
  getProductStats,
  bulkUpdateProducts,
  bulkDeleteProducts,
  bulkAddProducts,
  updateProductFlag,
  getDistinctProductTags,
  lookupProductByCode,
};
