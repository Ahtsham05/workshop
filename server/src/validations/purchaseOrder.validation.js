const Joi = require('joi');

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

const itemSchema = Joi.object().keys({
  product: objectId.required(),
  productName: Joi.string().allow('').optional(),
  productNameUrdu: Joi.string().allow('').optional(),
  quantity: Joi.number().min(0).required(),
  unit: Joi.string().allow('').optional(),
  conversionFactor: Joi.number().positive().optional(),
  expectedPrice: Joi.number().min(0).required(),
  expectedSellingPrice: Joi.number().min(0).optional(),
  total: Joi.number().min(0).required(),
  notes: Joi.string().allow('').optional(),
});

const createPurchaseOrder = {
  body: Joi.object().keys({
    supplier: objectId.required(),
    orderNumber: Joi.string().optional(),
    items: Joi.array().items(itemSchema).min(1).required(),
    orderDate: Joi.date().optional(),
    expectedDeliveryDate: Joi.date().optional().allow(null, ''),
    subtotal: Joi.number().min(0).required(),
    discount: Joi.number().min(0).optional(),
    tax: Joi.number().min(0).optional(),
    shippingCost: Joi.number().min(0).optional(),
    totalAmount: Joi.number().min(0).required(),
    status: Joi.string().valid('draft', 'sent').optional(),
    notes: Joi.string().allow('').optional(),
    termsAndConditions: Joi.string().allow('').optional(),
  }),
};

const updatePurchaseOrder = {
  params: Joi.object().keys({
    purchaseOrderId: objectId.required(),
  }),
  body: Joi.object()
    .keys({
      supplier: objectId.optional(),
      items: Joi.array().items(itemSchema).optional(),
      orderDate: Joi.date().optional(),
      expectedDeliveryDate: Joi.date().optional().allow(null, ''),
      subtotal: Joi.number().min(0).optional(),
      discount: Joi.number().min(0).optional(),
      tax: Joi.number().min(0).optional(),
      shippingCost: Joi.number().min(0).optional(),
      totalAmount: Joi.number().min(0).optional(),
      status: Joi.string().valid('draft', 'sent').optional(),
      notes: Joi.string().allow('').optional(),
      termsAndConditions: Joi.string().allow('').optional(),
    })
    .min(1),
};

const getPurchaseOrders = {
  query: Joi.object().keys({
    supplier: objectId,
    status: Joi.string().valid('draft', 'sent', 'partial', 'completed', 'cancelled', 'open'),
    startDate: Joi.date(),
    endDate: Joi.date(),
    limit: Joi.number(),
    page: Joi.number(),
    sortBy: Joi.string(),
    search: Joi.string().allow(''),
    fieldName: Joi.string(),
  }),
};

const getPurchaseOrder = {
  params: Joi.object().keys({
    purchaseOrderId: objectId.required(),
  }),
};

const deletePurchaseOrder = {
  params: Joi.object().keys({
    purchaseOrderId: objectId.required(),
  }),
};

const cancelPurchaseOrder = {
  params: Joi.object().keys({
    purchaseOrderId: objectId.required(),
  }),
  body: Joi.object().keys({
    cancellationReason: Joi.string().allow('').optional(),
  }),
};

const sendPurchaseOrder = {
  params: Joi.object().keys({
    purchaseOrderId: objectId.required(),
  }),
};

const receiveItems = {
  params: Joi.object().keys({
    purchaseOrderId: objectId.required(),
  }),
  body: Joi.object().keys({
    receivedAt: Joi.date().optional(),
    notes: Joi.string().allow('').optional(),
    paymentType: Joi.string().valid('Cash', 'Card', 'Bank Transfer', 'Cheque', 'Credit', 'Wallet').optional(),
    walletType: Joi.string().trim().when('paymentType', {
      is: 'Wallet',
      then: Joi.required(),
      otherwise: Joi.allow('').optional(),
    }),
    paidAmount: Joi.number().min(0).optional(),
    items: Joi.array()
      .items(
        Joi.object().keys({
          product: objectId.required(),
          receivedQuantity: Joi.number().min(0).required(),
          priceAtPurchase: Joi.number().min(0).required(),
          sellingPriceAtPurchase: Joi.number().min(0).optional(),
          unit: Joi.string().allow('').optional(),
          conversionFactor: Joi.number().positive().optional(),
          notes: Joi.string().allow('').optional(),
        })
      )
      .min(1)
      .required(),
  }),
};

module.exports = {
  createPurchaseOrder,
  updatePurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrder,
  deletePurchaseOrder,
  cancelPurchaseOrder,
  sendPurchaseOrder,
  receiveItems,
};
