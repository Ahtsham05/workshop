const Joi = require('joi');

// Each entry is either a plain IMEI string, or a { imei, imei2 } pair for dual-SIM phones.
const imeiEntry = Joi.alternatives().try(
  Joi.string().trim(),
  Joi.object().keys({
    imei: Joi.string().trim().required(),
    imei2: Joi.string().trim().allow('').optional(),
  }),
);

// Optional per-line investor tag — only meaningful when the line creates a new Batch (see
// purchase.service.js's createPurchase), ignored otherwise.
const investorRuleEntry = Joi.object().keys({
  partnerId: Joi.string().required(),
  shareType: Joi.string().valid('percentage_of_profit', 'fixed_per_unit').required(),
  rate: Joi.number().min(0).required(),
});

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
        imeis: Joi.array().items(imeiEntry).optional(),
        variantId: Joi.string().optional(),
        batchNumber: Joi.string().trim().allow('').optional(),
        expiryDate: Joi.date().optional(),
        investorRule: investorRuleEntry.optional(),
      })
    ).required(),
    discountType: Joi.string().valid('fixed', 'percentage').optional(),
    discountValue: Joi.number().min(0).optional(),
    discount: Joi.number().min(0).optional(),
    totalAmount: Joi.number().required(),
    paidAmount: Joi.number().min(0),
    balance: Joi.number(),
    // Settlement status (does the unpaid remainder become a Supplier Ledger debt) — kept
    // separate from `paymentMethod` (which account absorbs `paidAmount`) so a Credit purchase
    // can still specify a real account for whatever's paid right now.
    type: Joi.string().valid('cash', 'credit'),
    paymentMethod: Joi.string().valid('cash', 'wallet'),
    walletType: Joi.string().trim().when('paymentMethod', {
      is: 'wallet',
      then: Joi.required(),
      otherwise: Joi.allow('').optional(),
    }),
    // Optional second payment leg (e.g. paid partly cash, partly from a wallet/bank account).
    splitPaymentMethod: Joi.string().valid('cash', 'wallet').allow(null, ''),
    splitWalletType: Joi.string().trim().when('splitPaymentMethod', {
      is: 'wallet',
      then: Joi.required(),
      otherwise: Joi.allow('').optional(),
    }),
    splitPaidAmount: Joi.number().min(0),
    // Legacy field — accepted-but-ignored for backward compatibility with older clients;
    // the server always derives and stores it from `type`+`paymentMethod`.
    paymentType: Joi.string().valid('Cash', 'Card', 'Bank Transfer', 'Cheque', 'Credit', 'Wallet').optional(),
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
        imeis: Joi.array().items(imeiEntry).optional(),
        variantId: Joi.string().optional(),
        batchNumber: Joi.string().trim().allow('').optional(),
        expiryDate: Joi.date().optional(),
        investorRule: investorRuleEntry.optional(),
      })
    ),
    discountType: Joi.string().valid('fixed', 'percentage').optional(),
    discountValue: Joi.number().min(0).optional(),
    discount: Joi.number().min(0).optional(),
    totalAmount: Joi.number(),
    paidAmount: Joi.number().min(0),
    balance: Joi.number(),
    // Settlement status (does the unpaid remainder become a Supplier Ledger debt) — kept
    // separate from `paymentMethod` (which account absorbs `paidAmount`) so a Credit purchase
    // can still specify a real account for whatever's paid right now.
    type: Joi.string().valid('cash', 'credit'),
    paymentMethod: Joi.string().valid('cash', 'wallet'),
    walletType: Joi.string().trim().when('paymentMethod', {
      is: 'wallet',
      then: Joi.required(),
      otherwise: Joi.allow('').optional(),
    }),
    // Optional second payment leg (e.g. paid partly cash, partly from a wallet/bank account).
    splitPaymentMethod: Joi.string().valid('cash', 'wallet').allow(null, ''),
    splitWalletType: Joi.string().trim().when('splitPaymentMethod', {
      is: 'wallet',
      then: Joi.required(),
      otherwise: Joi.allow('').optional(),
    }),
    splitPaidAmount: Joi.number().min(0),
    // Legacy field — accepted-but-ignored for backward compatibility with older clients;
    // the server always derives and stores it from `type`+`paymentMethod`.
    paymentType: Joi.string().valid('Cash', 'Card', 'Bank Transfer', 'Cheque', 'Credit', 'Wallet').optional(),
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
