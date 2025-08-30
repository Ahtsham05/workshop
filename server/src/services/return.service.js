const httpStatus = require('http-status');
const { Return, Invoice, Product } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a return
 * @param {Object} returnBody
 * @param {Object} user
 * @returns {Promise<Return>}
 */
const createReturn = async (returnBody, user) => {
    // Verify the original invoice exists
    const originalInvoice = await Invoice.findById(returnBody.originalInvoiceId);
    if (!originalInvoice) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Original invoice not found');
    }

    // Verify that the invoice is finalized or paid
    if (!['finalized', 'paid'].includes(originalInvoice.status)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Can only create returns for finalized or paid invoices');
    }

    // Validate return items against original invoice items
    for (const returnItem of returnBody.items) {
        const originalItem = originalInvoice.items.find(
            item => item.productId.toString() === returnItem.productId.toString()
        );
        
        if (!originalItem) {
            throw new ApiError(httpStatus.BAD_REQUEST, `Product ${returnItem.name} was not in the original invoice`);
        }

        if (returnItem.returnedQuantity > originalItem.quantity) {
            throw new ApiError(httpStatus.BAD_REQUEST, 
                `Cannot return ${returnItem.returnedQuantity} units of ${returnItem.name}. Only ${originalItem.quantity} were purchased`);
        }

        // Check if there are already returns for this item
        const existingReturns = await Return.find({
            originalInvoiceId: returnBody.originalInvoiceId,
            'items.productId': returnItem.productId,
            status: { $in: ['approved', 'processed', 'completed'] }
        });

        const totalPreviouslyReturned = existingReturns.reduce((total, returnDoc) => {
            const item = returnDoc.items.find(i => i.productId.toString() === returnItem.productId.toString());
            return total + (item ? item.returnedQuantity : 0);
        }, 0);

        if (totalPreviouslyReturned + returnItem.returnedQuantity > originalItem.quantity) {
            throw new ApiError(httpStatus.BAD_REQUEST, 
                `Cannot return ${returnItem.returnedQuantity} units of ${returnItem.name}. Only ${originalItem.quantity - totalPreviouslyReturned} units remain available for return`);
        }

        // Set the return amount based on unit price
        returnItem.returnAmount = returnItem.returnedQuantity * returnItem.unitPrice;
    }

    // Set user fields
    returnBody.createdBy = user._id;

    // Create the return
    const returnDoc = new Return(returnBody);
    returnDoc.calculateTotals();
    
    await returnDoc.save();
    
    return returnDoc;
};

/**
 * Query for returns
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryReturns = async (filter, options) => {
    const returns = await Return.paginate(filter, {
        ...options,
        populate: 'originalInvoiceId,customerId,createdBy,approvedBy,processedBy'
    });
    return returns;
};

/**
 * Get return by id
 * @param {ObjectId} id
 * @returns {Promise<Return>}
 */
const getReturnById = async (id) => {
    const returnDoc = await Return.findById(id)
        .populate('originalInvoiceId', 'invoiceNumber type total customerId')
        .populate('customerId', 'name phone email')
        .populate('createdBy', 'name email')
        .populate('approvedBy', 'name email')
        .populate('processedBy', 'name email');
    
    if (!returnDoc) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Return not found');
    }
    return returnDoc;
};

/**
 * Update return by id
 * @param {ObjectId} returnId
 * @param {Object} updateBody
 * @param {Object} user
 * @returns {Promise<Return>}
 */
const updateReturnById = async (returnId, updateBody, user) => {
    const returnDoc = await getReturnById(returnId);
    
    // Prevent updating certain fields if already processed
    if (['processed', 'completed'].includes(returnDoc.status)) {
        const restrictedFields = ['items', 'totalReturnAmount', 'refundAmount', 'returnType', 'refundMethod'];
        const hasRestrictedUpdates = restrictedFields.some(field => updateBody.hasOwnProperty(field));
        
        if (hasRestrictedUpdates) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot modify processed or completed returns');
        }
    }

    Object.assign(returnDoc, updateBody);
    
    // Recalculate totals if financial fields were updated
    if (updateBody.restockingFee !== undefined || updateBody.processingFee !== undefined) {
        returnDoc.calculateTotals();
    }

    await returnDoc.save();
    return returnDoc;
};

/**
 * Delete return by id
 * @param {ObjectId} returnId
 * @returns {Promise<Return>}
 */
const deleteReturnById = async (returnId) => {
    const returnDoc = await getReturnById(returnId);
    
    // Only allow deletion of pending or rejected returns
    if (!['pending', 'rejected'].includes(returnDoc.status)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Can only delete pending or rejected returns');
    }
    
    await returnDoc.remove();
    return returnDoc;
};

/**
 * Approve return
 * @param {ObjectId} returnId
 * @param {Object} user
 * @param {Object} approvalData
 * @returns {Promise<Return>}
 */
const approveReturn = async (returnId, user, approvalData = {}) => {
    const returnDoc = await getReturnById(returnId);
    
    if (returnDoc.status !== 'pending') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Can only approve pending returns');
    }

    returnDoc.approve(user._id);
    
    if (approvalData.notes) {
        returnDoc.notes = returnDoc.notes ? `${returnDoc.notes}\n${approvalData.notes}` : approvalData.notes;
    }

    await returnDoc.save();
    return returnDoc;
};

/**
 * Reject return
 * @param {ObjectId} returnId
 * @param {Object} user
 * @param {Object} rejectionData
 * @returns {Promise<Return>}
 */
const rejectReturn = async (returnId, user, rejectionData) => {
    const returnDoc = await getReturnById(returnId);
    
    if (returnDoc.status !== 'pending') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Can only reject pending returns');
    }

    returnDoc.reject(rejectionData.rejectionReason);
    
    if (rejectionData.notes) {
        returnDoc.notes = returnDoc.notes ? `${returnDoc.notes}\n${rejectionData.notes}` : rejectionData.notes;
    }

    await returnDoc.save();
    return returnDoc;
};

/**
 * Process return (complete the return and adjust inventory)
 * @param {ObjectId} returnId
 * @param {Object} user
 * @param {Object} processData
 * @returns {Promise<Return>}
 */
const processReturn = async (returnId, user, processData = {}) => {
    const returnDoc = await getReturnById(returnId);
    
    if (returnDoc.status !== 'approved') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Can only process approved returns');
    }

    // Adjust inventory if requested and not already done
    if (processData.adjustInventory !== false && !returnDoc.inventoryAdjusted) {
        for (const returnItem of returnDoc.items) {
            if (returnItem.restockable) {
                const product = await Product.findById(returnItem.productId);
                if (product) {
                    product.stockQuantity += returnItem.returnedQuantity;
                    await product.save();
                }
            }
        }
        returnDoc.inventoryAdjusted = true;
    }

    returnDoc.process(user._id);
    returnDoc.complete(); // Automatically complete after processing
    
    if (processData.notes) {
        returnDoc.notes = returnDoc.notes ? `${returnDoc.notes}\n${processData.notes}` : processData.notes;
    }

    await returnDoc.save();
    return returnDoc;
};

/**
 * Get returns by invoice
 * @param {ObjectId} invoiceId
 * @param {Object} filter
 * @param {Object} options
 * @returns {Promise<QueryResult>}
 */
const getReturnsByInvoice = async (invoiceId, filter = {}, options = {}) => {
    const combinedFilter = { ...filter, originalInvoiceId: invoiceId };
    return queryReturns(combinedFilter, options);
};

/**
 * Get returns by customer
 * @param {ObjectId|string} customerId
 * @param {Object} filter
 * @param {Object} options
 * @returns {Promise<QueryResult>}
 */
const getReturnsByCustomer = async (customerId, filter = {}, options = {}) => {
    const combinedFilter = { ...filter, customerId };
    return queryReturns(combinedFilter, options);
};

/**
 * Get return statistics
 * @param {Object} filter
 * @returns {Promise<Object>}
 */
const getReturnStatistics = async (filter = {}) => {
    return Return.getStatistics(filter.dateFrom, filter.dateTo);
};

module.exports = {
    createReturn,
    queryReturns,
    getReturnById,
    updateReturnById,
    deleteReturnById,
    approveReturn,
    rejectReturn,
    processReturn,
    getReturnsByInvoice,
    getReturnsByCustomer,
    getReturnStatistics
};
