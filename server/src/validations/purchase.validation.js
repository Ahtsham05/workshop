const Joi = require('joi');

const createPurchase = {
  body: Joi.object().keys({
    supplier: Joi.string().required(),
    invoiceNumber: Joi.string(),
    items: Joi.array().items(
      Joi.object().keys({
        product: Joi.string().required(),
        quantity: Joi.number().required(),
        unit: Joi.string().allow(''), // Allow unit field
        conversionFactor: Joi.number().positive().optional(),
        stockQuantity: Joi.number().positive().optional(),
        priceAtPurchase: Joi.number().required(),
        sellingPriceAtPurchase: Joi.number().min(0).optional(),
        discountType: Joi.string().valid('fixed', 'percentage').optional(),
        discountValue: Joi.number().min(0).optional(),
        discountAmount: Joi.number().min(0).optional(),
        total: Joi.number().required(),
        imeis: Joi.array().items(Joi.string().trim()).optional(),
        variantId: Joi.string().optional(),
        batchNumber: Joi.string().trim().allow('').optional(),
        expiryDate: Joi.date().optional(),
      })
    ).required(),
    discountType: Joi.string().valid('fixed', 'percentage').optional(),
    discountValue: Joi.number().min(0).optional(),
    discount: Joi.number().min(0).optional(),
    totalAmount: Joi.number().required(),
    paidAmount: Joi.number().min(0),
    balance: Joi.number().min(0),
    paymentType: Joi.string().valid('Cash', 'Card', 'Bank Transfer', 'Cheque', 'Credit', 'Wallet'),
    walletType: Joi.string().trim().when('paymentType', {
      is: 'Wallet',
      then: Joi.required(),
      otherwise: Joi.allow('').optional(),
    }),
    purchaseDate: Joi.date(),
    notes: Joi.string().allow(''),
  }),
};

const getPurchases = {
  query: Joi.object().keys({
    supplier: Joi.string(),
    purchaseDate: Joi.date(),
    limit: Joi.number(),
    page: Joi.number(),
    sortBy: Joi.string(),
    search: Joi.string(),
    fieldName: Joi.string(),
  }),
};

const getPurchase = {
  params: Joi.object().keys({
    purchaseId: Joi.string().required(),
  }),
};

const updatePurchase = {
  params: Joi.object().keys({
    purchaseId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    supplier: Joi.string(),
    invoiceNumber: Joi.string(),
    items: Joi.array().items(
      Joi.object().keys({
        product: Joi.string(),
        quantity: Joi.number(),
        unit: Joi.string().allow(''), // Allow unit field
        conversionFactor: Joi.number().positive().optional(),
        stockQuantity: Joi.number().positive().optional(),
        priceAtPurchase: Joi.number(),
        sellingPriceAtPurchase: Joi.number().min(0).optional(),
        discountType: Joi.string().valid('fixed', 'percentage').optional(),
        discountValue: Joi.number().min(0).optional(),
        discountAmount: Joi.number().min(0).optional(),
        total: Joi.number(),
        imeis: Joi.array().items(Joi.string().trim()).optional(),
        variantId: Joi.string().optional(),
        batchNumber: Joi.string().trim().allow('').optional(),
        expiryDate: Joi.date().optional(),
      })
    ),
    discountType: Joi.string().valid('fixed', 'percentage').optional(),
    discountValue: Joi.number().min(0).optional(),
    discount: Joi.number().min(0).optional(),
    totalAmount: Joi.number(),
    paidAmount: Joi.number().min(0),
    balance: Joi.number().min(0),
    paymentType: Joi.string().valid('Cash', 'Card', 'Bank Transfer', 'Cheque', 'Credit', 'Wallet'),
    walletType: Joi.string().trim().when('paymentType', {
      is: 'Wallet',
      then: Joi.required(),
      otherwise: Joi.allow('').optional(),
    }),
    purchaseDate: Joi.date(),
    notes: Joi.string().allow(''),
  }),
};

const deletePurchase = {
  params: Joi.object().keys({
    purchaseId: Joi.string().required(),
  }),
};

const getPurchaseByDate = {
  query: Joi.object().keys({
    startDate: Joi.date(),
    endDate: Joi.date(),
  }),
};

module.exports = {
  createPurchase,
  getPurchases,
  getPurchase,
  updatePurchase,
  deletePurchase,
  getPurchaseByDate
};
