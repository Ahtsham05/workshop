const Joi = require('joi');

const attachmentEntry = Joi.object().keys({
  url: Joi.string().required(),
  publicId: Joi.string().required(),
  fileName: Joi.string().allow('').optional(),
  fileType: Joi.string().valid('image', 'pdf').optional(),
  fileSize: Joi.number().optional(),
});

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
    vendorBillNumber: Joi.string().trim().allow('').optional(),
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
    // Credit terms: when the unpaid remainder is due. Drives overdue badges/filters.
    dueDate: Joi.date().allow(null),
    notes: Joi.string().allow(''),
    attachments: Joi.array().items(attachmentEntry).optional(),
  }),
};

// One shared shape for the list, its stat-card summary and its export — all three run the
// same filters, so they must accept the same query string (see purchase.controller.js's
// PURCHASE_LIST_OPTIONS). Comma-separated values are allowed on the multi-select filters.
const purchaseListQuery = Joi.object().keys({
  supplier: Joi.string().allow(''),
  purchaseDate: Joi.date(),
  limit: Joi.number(),
  page: Joi.number(),
  sortBy: Joi.string(),
  search: Joi.string().allow(''),
  // Which field(s) the global search box should look in.
  searchBy: Joi.string().valid('all', 'invoice', 'vendorBill', 'supplier', 'product', 'reference', 'notes'),
  fieldName: Joi.string().allow(''),
  paymentStatus: Joi.string().allow(''),
  paymentType: Joi.string().allow(''),
  invoiceStatus: Joi.string().allow(''),
  dueStatus: Joi.string().allow(''),
  createdBy: Joi.string().allow(''),
  branch: Joi.string().allow(''),
  category: Joi.string().allow(''),
  startDate: Joi.date(),
  endDate: Joi.date(),
  minAmount: Joi.number().allow(''),
  maxAmount: Joi.number().allow(''),
});

const getPurchases = { query: purchaseListQuery };

const getPurchasesSummary = { query: purchaseListQuery };

const exportPurchases = { query: purchaseListQuery };

const addPurchaseComment = {
  params: Joi.object().keys({
    purchaseId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    message: Joi.string().trim().min(1).max(2000).required(),
  }),
};

const deletePurchaseComment = {
  params: Joi.object().keys({
    purchaseId: Joi.string().required(),
    commentId: Joi.string().required(),
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
    vendorBillNumber: Joi.string().trim().allow('').optional(),
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
    // Credit terms: when the unpaid remainder is due. Drives overdue badges/filters.
    dueDate: Joi.date().allow(null),
    notes: Joi.string().allow(''),
    attachments: Joi.array().items(attachmentEntry).optional(),
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

// Purchase price intelligence: one bulk request for every product/variant currently in
// the purchase form, instead of a request per product — see purchase.service.js's
// getBulkPriceComparison. Capped at 500 items, well above what a single purchase invoice
// realistically holds, just to bound the aggregation's input size.
const getBulkPriceComparison = {
  body: Joi.object().keys({
    supplierId: Joi.string().optional(),
    items: Joi.array()
      .items(
        Joi.object().keys({
          productId: Joi.string().required(),
          variantId: Joi.string().optional(),
        })
      )
      .min(1)
      .max(500)
      .required(),
  }),
};

module.exports = {
  createPurchase,
  getPurchases,
  getPurchasesSummary,
  exportPurchases,
  addPurchaseComment,
  deletePurchaseComment,
  getPurchase,
  updatePurchase,
  deletePurchase,
  getPurchaseByDate,
  getBulkPriceComparison,
};
