const Joi = require('joi');
const { objectId } = require('./custom.validation');

const invoiceItem = Joi.object({
  productId: Joi.string().custom(objectId).required(),
  name: Joi.string().required(),
  image: Joi.object({
    url: Joi.string(),
    publicId: Joi.string()
  }).optional(),
  quantity: Joi.number().integer().min(1).required(),
  unitPrice: Joi.number().min(0).required(),
  cost: Joi.number().min(0).required(),
  subtotal: Joi.number().min(0).required(),
  profit: Joi.number().required(),
  isManualEntry: Joi.boolean().optional()
});

const splitPayment = Joi.object({
  method: Joi.string().valid('cash', 'card', 'digital', 'check').required(),
  amount: Joi.number().min(0).required(),
  reference: Joi.string().optional()
});

const createInvoice = {
  body: Joi.object({
    items: Joi.array().items(invoiceItem).min(1).required(),
    customerId: Joi.alternatives().try(
      Joi.string().custom(objectId),
      Joi.string().valid('walk-in')
    ).optional(),
    customerName: Joi.string().optional(),
    walkInCustomerName: Joi.string().optional(),
    type: Joi.string().valid('cash', 'credit', 'pending').default('cash'),
    subtotal: Joi.number().min(0).required(),
    tax: Joi.number().min(0).default(0),
    discount: Joi.number().min(0).default(0),
    total: Joi.number().min(0).required(),
    totalProfit: Joi.number().required(),
    totalCost: Joi.number().min(0).required(),
    paidAmount: Joi.number().min(0).default(0),
    balance: Joi.number().default(0),
    dueDate: Joi.date().when('type', {
      is: 'credit',
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    deliveryCharge: Joi.number().min(0).default(0),
    serviceCharge: Joi.number().min(0).default(0),
    roundingAdjustment: Joi.number().default(0),
    splitPayment: Joi.array().items(splitPayment).optional(),
    loyaltyPoints: Joi.number().min(0).default(0),
    couponCode: Joi.string().optional(),
    returnPolicy: Joi.string().optional(),
    notes: Joi.string().optional()
  })
};

const getInvoices = {
  query: Joi.object({
    customerId: Joi.string().custom(objectId),
    type: Joi.string().valid('cash', 'credit', 'pending'),
    status: Joi.string().valid('draft', 'finalized', 'paid', 'cancelled', 'refunded'),
    invoiceNumber: Joi.string(),
    dateFrom: Joi.date(),
    dateTo: Joi.date(),
    search: Joi.string(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer()
  })
};

const getInvoice = {
  params: Joi.object({
    invoiceId: Joi.string().custom(objectId)
  })
};

const updateInvoice = {
  params: Joi.object({
    invoiceId: Joi.string().custom(objectId)
  }),
  body: Joi.object({
    items: Joi.array().items(invoiceItem).min(1).optional(),
    customerId: Joi.alternatives().try(
      Joi.string().custom(objectId),
      Joi.string().valid('walk-in')
    ).optional(),
    customerName: Joi.string().optional(),
    walkInCustomerName: Joi.string().optional(),
    type: Joi.string().valid('cash', 'credit', 'pending').optional(),
    subtotal: Joi.number().min(0).optional(),
    tax: Joi.number().min(0).optional(),
    discount: Joi.number().min(0).optional(),
    total: Joi.number().min(0).optional(),
    totalProfit: Joi.number().optional(),
    totalCost: Joi.number().min(0).optional(),
    paidAmount: Joi.number().min(0).optional(),
    balance: Joi.number().optional(),
    dueDate: Joi.date().optional(),
    deliveryCharge: Joi.number().min(0).optional(),
    serviceCharge: Joi.number().min(0).optional(),
    roundingAdjustment: Joi.number().optional(),
    splitPayment: Joi.array().items(splitPayment).optional(),
    loyaltyPoints: Joi.number().min(0).optional(),
    couponCode: Joi.string().optional(),
    returnPolicy: Joi.string().optional(),
    notes: Joi.string().optional(),
    status: Joi.string().valid('draft', 'finalized', 'paid', 'cancelled', 'refunded').optional(),
    allowUpdateFinalized: Joi.boolean().optional()
  })
};

const deleteInvoice = {
  params: Joi.object({
    invoiceId: Joi.string().custom(objectId)
  })
};

const finalizeInvoice = {
  params: Joi.object({
    invoiceId: Joi.string().custom(objectId)
  })
};

const processPayment = {
  params: Joi.object({
    invoiceId: Joi.string().custom(objectId)
  }),
  body: Joi.object({
    amount: Joi.number().min(0.01).required(),
    method: Joi.string().valid('cash', 'card', 'digital', 'check').default('cash'),
    reference: Joi.string().optional()
  })
};

const getInvoiceStatistics = {
  query: Joi.object({
    dateFrom: Joi.date(),
    dateTo: Joi.date(),
    customerId: Joi.string().custom(objectId),
    type: Joi.string().valid('cash', 'credit', 'pending')
  })
};

const getDailySalesReport = {
  query: Joi.object({
    date: Joi.date()
  })
};

const getInvoicesByCustomer = {
  params: Joi.object({
    customerId: Joi.string().custom(objectId)
  }),
  query: Joi.object({
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer()
  })
};

const getOutstandingInvoices = {
  query: Joi.object({
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer()
  })
};

const cancelInvoice = {
  params: Joi.object({
    invoiceId: Joi.string().custom(objectId)
  })
};

const duplicateInvoice = {
  params: Joi.object({
    invoiceId: Joi.string().custom(objectId)
  })
};

module.exports = {
  createInvoice,
  getInvoices,
  getInvoice,
  updateInvoice,
  deleteInvoice,
  finalizeInvoice,
  processPayment,
  getInvoiceStatistics,
  getDailySalesReport,
  getInvoicesByCustomer,
  getOutstandingInvoices,
  cancelInvoice,
  duplicateInvoice
};
