const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

// Sub-schema for returned items
const returnItemSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    image: {
        url: { type: String },
        publicId: { type: String }
    },
    originalQuantity: { type: Number, required: true, min: 1 },
    returnedQuantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    cost: { type: Number, required: true, min: 0 },
    returnAmount: { type: Number, required: true, min: 0 },
    reason: { 
        type: String, 
        enum: ['defective', 'wrong_item', 'customer_request', 'damaged', 'expired', 'other'],
        required: true 
    },
    condition: { 
        type: String, 
        enum: ['new', 'used', 'damaged', 'defective'],
        default: 'used'
    },
    restockable: { type: Boolean, default: true }
}, { _id: false });

const ReturnSchema = new mongoose.Schema({
    // Reference to original invoice
    originalInvoiceId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Invoice', 
        required: true 
    },
    originalInvoiceNumber: { type: String, required: true },
    
    // Customer information (copied from original invoice)
    customerId: { 
        type: mongoose.Schema.Types.Mixed, 
        ref: 'Customer' 
    },
    customerName: { type: String },
    walkInCustomerName: { type: String },
    
    // Return details
    returnNumber: { type: String, unique: true },
    returnDate: { type: Date, default: Date.now },
    
    // Returned items
    items: [returnItemSchema],
    
    // Financial calculations
    totalReturnAmount: { type: Number, required: true, min: 0 },
    refundAmount: { type: Number, required: true, min: 0 },
    restockingFee: { type: Number, default: 0, min: 0 },
    processingFee: { type: Number, default: 0, min: 0 },
    
    // Return type and method
    returnType: { 
        type: String, 
        enum: ['full_refund', 'partial_refund', 'exchange', 'store_credit'], 
        required: true 
    },
    refundMethod: { 
        type: String, 
        enum: ['cash', 'card', 'original_payment', 'store_credit'],
        required: true 
    },
    
    // Status and workflow
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected', 'processed', 'completed'], 
        default: 'pending' 
    },
    
    // Approval workflow
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectionReason: { type: String },
    
    // Additional information
    returnReason: { type: String, required: true },
    notes: { type: String },
    receiptRequired: { type: Boolean, default: true },
    receiptProvided: { type: Boolean, default: false },
    
    // Inventory impact
    inventoryAdjusted: { type: Boolean, default: false },
    
    // System fields
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    processedAt: { type: Date }
}, {
    timestamps: true
});

// add plugin that converts mongoose to json
ReturnSchema.plugin(toJSON);
ReturnSchema.plugin(paginate);

// Generate return number before saving
ReturnSchema.pre('save', async function(next) {
    if (this.isNew && !this.returnNumber) {
        const count = await mongoose.models.Return.countDocuments();
        const year = new Date().getFullYear();
        const month = String(new Date().getMonth() + 1).padStart(2, '0');
        this.returnNumber = `RET-${year}${month}-${String(count + 1).padStart(6, '0')}`;
    }
    next();
});

// Method to calculate totals
ReturnSchema.methods.calculateTotals = function() {
    this.totalReturnAmount = this.items.reduce((sum, item) => sum + item.returnAmount, 0);
    this.refundAmount = this.totalReturnAmount - this.restockingFee - this.processingFee;
    
    // Ensure refund amount is not negative
    if (this.refundAmount < 0) {
        this.refundAmount = 0;
    }
    
    return {
        totalReturnAmount: this.totalReturnAmount,
        refundAmount: this.refundAmount
    };
};

// Method to approve return
ReturnSchema.methods.approve = function(approvedByUserId) {
    this.status = 'approved';
    this.approvedBy = approvedByUserId;
    this.approvedAt = new Date();
    return this;
};

// Method to reject return
ReturnSchema.methods.reject = function(reason) {
    this.status = 'rejected';
    this.rejectionReason = reason;
    return this;
};

// Method to process return
ReturnSchema.methods.process = function(processedByUserId) {
    this.status = 'processed';
    this.processedBy = processedByUserId;
    this.processedAt = new Date();
    return this;
};

// Method to complete return
ReturnSchema.methods.complete = function() {
    this.status = 'completed';
    return this;
};

// Static method to get return statistics
ReturnSchema.statics.getStatistics = async function(dateFrom, dateTo) {
    const match = {};
    if (dateFrom || dateTo) {
        match.createdAt = {};
        if (dateFrom) match.createdAt.$gte = new Date(dateFrom);
        if (dateTo) match.createdAt.$lte = new Date(dateTo);
    }
    
    const stats = await this.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                totalReturns: { $sum: 1 },
                totalReturnAmount: { $sum: '$totalReturnAmount' },
                totalRefundAmount: { $sum: '$refundAmount' },
                avgReturnValue: { $avg: '$totalReturnAmount' },
                pendingReturns: {
                    $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                },
                approvedReturns: {
                    $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
                },
                rejectedReturns: {
                    $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] }
                },
                completedReturns: {
                    $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                }
            }
        }
    ]);
    
    return stats[0] || {
        totalReturns: 0,
        totalReturnAmount: 0,
        totalRefundAmount: 0,
        avgReturnValue: 0,
        pendingReturns: 0,
        approvedReturns: 0,
        rejectedReturns: 0,
        completedReturns: 0
    };
};

const Return = mongoose.model('Return', ReturnSchema);

module.exports = Return;
