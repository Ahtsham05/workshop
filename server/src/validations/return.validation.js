const Joi = require('joi');
const { objectId } = require('./custom.validation');

const returnItemSchema = Joi.object({
    productId: Joi.string().custom(objectId).required(),
    name: Joi.string().required(),
    image: Joi.object({
        url: Joi.string().uri().allow(''),
        publicId: Joi.string().allow('')
    }),
    originalQuantity: Joi.number().integer().min(1).required(),
    returnedQuantity: Joi.number().integer().min(1).required(),
    unitPrice: Joi.number().min(0).required(),
    cost: Joi.number().min(0).required(),
    returnAmount: Joi.number().min(0).required(),
    reason: Joi.string().valid('defective', 'wrong_item', 'customer_request', 'damaged', 'expired', 'other').required(),
    condition: Joi.string().valid('new', 'used', 'damaged', 'defective').default('used'),
    restockable: Joi.boolean().default(true)
});

const createReturn = {
    body: Joi.object().keys({
        originalInvoiceId: Joi.string().custom(objectId).required(),
        originalInvoiceNumber: Joi.string().required(),
        customerId: Joi.alternatives().try(
            Joi.string().custom(objectId),
            Joi.string().valid('walk-in')
        ),
        customerName: Joi.string(),
        walkInCustomerName: Joi.string(),
        items: Joi.array().items(returnItemSchema).min(1).required(),
        returnType: Joi.string().valid('full_refund', 'partial_refund', 'exchange', 'store_credit').required(),
        refundMethod: Joi.string().valid('cash', 'card', 'original_payment', 'store_credit').required(),
        returnReason: Joi.string().required(),
        notes: Joi.string().allow(''),
        receiptRequired: Joi.boolean().default(true),
        receiptProvided: Joi.boolean().default(false),
        restockingFee: Joi.number().min(0).default(0),
        processingFee: Joi.number().min(0).default(0)
    })
};

const getReturns = {
    query: Joi.object().keys({
        status: Joi.string().valid('pending', 'approved', 'rejected', 'processed', 'completed'),
        returnType: Joi.string().valid('full_refund', 'partial_refund', 'exchange', 'store_credit'),
        customerId: Joi.string().custom(objectId),
        originalInvoiceId: Joi.string().custom(objectId),
        dateFrom: Joi.date(),
        dateTo: Joi.date(),
        sortBy: Joi.string(),
        limit: Joi.number().integer(),
        page: Joi.number().integer(),
        populate: Joi.string()
    })
};

const getReturn = {
    params: Joi.object().keys({
        returnId: Joi.string().custom(objectId)
    })
};

const updateReturn = {
    params: Joi.object().keys({
        returnId: Joi.string().custom(objectId)
    }),
    body: Joi.object()
        .keys({
            status: Joi.string().valid('pending', 'approved', 'rejected', 'processed', 'completed'),
            returnType: Joi.string().valid('full_refund', 'partial_refund', 'exchange', 'store_credit'),
            refundMethod: Joi.string().valid('cash', 'card', 'original_payment', 'store_credit'),
            returnReason: Joi.string(),
            notes: Joi.string(),
            receiptRequired: Joi.boolean(),
            receiptProvided: Joi.boolean(),
            restockingFee: Joi.number().min(0),
            processingFee: Joi.number().min(0),
            rejectionReason: Joi.string(),
            inventoryAdjusted: Joi.boolean()
        })
        .min(1)
};

const deleteReturn = {
    params: Joi.object().keys({
        returnId: Joi.string().custom(objectId)
    })
};

const approveReturn = {
    params: Joi.object().keys({
        returnId: Joi.string().custom(objectId)
    }),
    body: Joi.object().keys({
        notes: Joi.string().allow('')
    })
};

const rejectReturn = {
    params: Joi.object().keys({
        returnId: Joi.string().custom(objectId)
    }),
    body: Joi.object().keys({
        rejectionReason: Joi.string().required(),
        notes: Joi.string().allow('')
    })
};

const processReturn = {
    params: Joi.object().keys({
        returnId: Joi.string().custom(objectId)
    }),
    body: Joi.object().keys({
        adjustInventory: Joi.boolean().default(true),
        notes: Joi.string().allow('')
    })
};

const getReturnsByInvoice = {
    params: Joi.object().keys({
        invoiceId: Joi.string().custom(objectId)
    }),
    query: Joi.object().keys({
        status: Joi.string().valid('pending', 'approved', 'rejected', 'processed', 'completed'),
        sortBy: Joi.string(),
        limit: Joi.number().integer(),
        page: Joi.number().integer()
    })
};

const getReturnsByCustomer = {
    params: Joi.object().keys({
        customerId: Joi.alternatives().try(
            Joi.string().custom(objectId),
            Joi.string().valid('walk-in')
        )
    }),
    query: Joi.object().keys({
        status: Joi.string().valid('pending', 'approved', 'rejected', 'processed', 'completed'),
        dateFrom: Joi.date(),
        dateTo: Joi.date(),
        sortBy: Joi.string(),
        limit: Joi.number().integer(),
        page: Joi.number().integer()
    })
};

const getReturnStatistics = {
    query: Joi.object().keys({
        dateFrom: Joi.date(),
        dateTo: Joi.date(),
        customerId: Joi.string().custom(objectId),
        status: Joi.string().valid('pending', 'approved', 'rejected', 'processed', 'completed')
    })
};

module.exports = {
    createReturn,
    getReturns,
    getReturn,
    updateReturn,
    deleteReturn,
    approveReturn,
    rejectReturn,
    processReturn,
    getReturnsByInvoice,
    getReturnsByCustomer,
    getReturnStatistics
};
