const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');
const { DEFAULT_UNIT } = require('../config/units');

// Sub-schema for split payments
const splitPaymentSchema = new mongoose.Schema({
    method: {
        type: String,
        enum: ['cash', 'card', 'digital', 'check'],
        required: true
    },
    amount: { type: Number, required: true },
    reference: { type: String }
}, { _id: false });

// Sub-schema for invoice items
const invoiceItemSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    nameUrdu: { type: String, default: '' },
    image: {
        url: { type: String },
        publicId: { type: String }
    },
    quantity: { type: Number, required: true, min: 1 },
    unit: { type: String, default: DEFAULT_UNIT }, // Unit of measurement
    conversionFactor: { type: Number, default: 1, min: 0.000001 },
    stockQuantity: {
        type: Number,
        min: 0,
        default: function defaultStockQuantity() {
            return this.quantity;
        }
    },
    unitPrice: { type: Number, required: true, min: 0 },
    cost: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
    profit: { type: Number, required: true },
    isManualEntry: { type: Boolean, default: false },
    imeis: [{ type: String, trim: true }], // IMEI/serial numbers sold for this line item, when product.trackImei is true
}, { _id: false });

const InvoiceSchema = new mongoose.Schema({
    // Invoice items
    items: [invoiceItemSchema],
    
    // Customer information
    customerId: { 
        type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and string for walk-in customers
        ref: 'Customer' 
    },
    customerName: { type: String },
    walkInCustomerName: { type: String }, // New field for walk-in customer names
    
    // Invoice type and status
    type: { 
        type: String, 
        enum: ['cash', 'credit', 'pending', 'quotation'], 
        required: true,
        default: 'cash'
    },
    
    // Financial calculations
    subtotal: { type: Number, required: true, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    totalProfit: { type: Number, required: true },
    totalCost: { type: Number, required: true, min: 0 },
    
    // Payment information
    paidAmount: { type: Number, default: 0, min: 0 },
    balance: { type: Number, default: 0 },
    dueDate: { type: Date },
    /** Optional delivery / billing address lines on the invoice (shown on prints when set). */
    invoiceAddress: { type: String, default: '' },
    invoiceAddressUrdu: { type: String, default: '' },
    
    // Additional charges
    deliveryCharge: { type: Number, default: 0, min: 0 },
    serviceCharge: { type: Number, default: 0, min: 0 },
    roundingAdjustment: { type: Number, default: 0 },
    
    // Payment method (how the customer paid)
    paymentMethod: {
        type: String,
        enum: ['cash', 'wallet', 'bank', 'card'],
        default: 'cash',
    },
    // Wallet name when paymentMethod is 'wallet' (e.g. 'JazzCash', 'EasyPaisa')
    walletType: { type: String },

    // POS features
    splitPayment: [splitPaymentSchema],
    loyaltyPoints: { type: Number, default: 0, min: 0 },
    couponCode: { type: String },
    returnPolicy: { type: String },
    
    // Conversion tracking for pending invoices
    isConvertedToBill: { type: Boolean, default: false },
    convertedAt: { type: Date },
    convertedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' }, // Reference to converted credit invoice
    billNumber: { type: String }, // Unique bill number for converted pending invoices
    
    // Additional information
    notes: { type: String },
    
    // System fields
    invoiceNumber: { type: String, unique: true },
    invoiceDate: { type: Date, default: Date.now },
    status: { 
        type: String, 
        enum: ['draft', 'finalized', 'paid', 'cancelled', 'refunded'], 
        default: 'draft' 
    },

    // Multi-tenant fields
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true,
        index: true,
    },

    // Audit fields
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    convertedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Language preference (overrides user setting per invoice)
    language: { type: String, enum: ['en', 'ur'] },
    isUrduOnly: { type: Boolean, default: false },
}, {
    timestamps: true
});

InvoiceSchema.index({ organizationId: 1, branchId: 1 });

// add plugin that converts mongoose to json
InvoiceSchema.plugin(toJSON);
InvoiceSchema.plugin(paginate);

// Generate next document number (INV- or QUO- prefix)
InvoiceSchema.statics.generateNextDocumentNumber = async function generateNextDocumentNumber(prefix = 'INV') {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const docPrefix = `${prefix}-${year}${month}-`;

    const lastInvoice = await mongoose.models.Invoice
        .findOne({ invoiceNumber: { $regex: `^${docPrefix}` } })
        .sort({ invoiceNumber: -1 })
        .select('invoiceNumber')
        .lean();

    let nextNum = 1;
    if (lastInvoice && lastInvoice.invoiceNumber) {
        const lastNum = parseInt(lastInvoice.invoiceNumber.replace(docPrefix, ''), 10);
        if (!isNaN(lastNum)) {
            nextNum = lastNum + 1;
        }
    }

    return `${docPrefix}${String(nextNum).padStart(6, '0')}`;
};

// Generate invoice number before saving
InvoiceSchema.pre('save', async function(next) {
    if (this.isNew && !this.invoiceNumber) {
        const prefix = this.type === 'quotation' ? 'QUO' : 'INV';
        this.invoiceNumber = await this.constructor.generateNextDocumentNumber(prefix);
    }
    next();
});

// Method to calculate totals
InvoiceSchema.methods.calculateTotals = function() {
    // Calculate subtotal from items
    this.subtotal = this.items.reduce((sum, item) => sum + item.subtotal, 0);
    
    // Calculate total profit and cost
    this.totalProfit = this.items.reduce((sum, item) => sum + item.profit, 0);
    this.totalCost = this.items.reduce((sum, item) => sum + (item.cost * (item.stockQuantity || item.quantity)), 0);
    
    // Calculate total with tax, discount, and charges
    const discountedSubtotal = this.subtotal - this.discount;
    const taxableAmount = discountedSubtotal + this.deliveryCharge + this.serviceCharge;
    this.total = taxableAmount + this.tax + this.roundingAdjustment;
    
    // Calculate balance
    this.balance = this.total - this.paidAmount;
    
    return {
        subtotal: this.subtotal,
        total: this.total,
        totalProfit: this.totalProfit,
        totalCost: this.totalCost,
        balance: this.balance
    };
};

// Method to finalize invoice
InvoiceSchema.methods.finalize = function() {
    if (this.type === 'cash') {
        // Cash sales are collected immediately — keep DB consistent with totals
        this.paidAmount = this.total;
        this.balance = 0;
        this.status = 'paid';
        return this;
    }
    this.status = 'finalized';
    if (this.paidAmount >= this.total) {
        this.status = 'paid';
        this.balance = 0;
    }
    return this;
};

// Method to mark as paid
InvoiceSchema.methods.markAsPaid = function(amount, paymentMethod = 'cash', reference = null) {
    this.paidAmount += amount;
    
    // Add to split payments if not cash or if there are existing split payments
    if (paymentMethod !== 'cash' || this.splitPayment.length > 0) {
        this.splitPayment.push({
            method: paymentMethod,
            amount: amount,
            reference: reference
        });
    }
    
    // Update balance
    this.balance = this.total - this.paidAmount;
    
    // Update status
    if (this.balance <= 0) {
        this.status = 'paid';
        this.balance = 0;
    }
    
    return this;
};

// Static method to generate unique bill number
InvoiceSchema.statics.generateBillNumber = async function() {
    // Get the count of unique bill numbers (not just converted invoices count)
    const lastBill = await this.findOne({ billNumber: { $exists: true, $ne: null } })
        .sort({ billNumber: -1 })
        .select('billNumber');
    
    let billCount = 1;
    if (lastBill && lastBill.billNumber) {
        // Extract number from format BILL-202512-000001
        const match = lastBill.billNumber.match(/-([0-9]{6})$/);
        if (match) {
            billCount = parseInt(match[1]) + 1;
        }
    }
    
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const uniqueId = String(billCount).padStart(6, '0');
    
    return `BILL-${year}${month}-${uniqueId}`;
};

// Static method to get invoice statistics
InvoiceSchema.statics.getStatistics = async function(dateFrom, dateTo) {
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
                totalInvoices: { $sum: 1 },
                totalAmount: { $sum: '$total' },
                totalProfit: { $sum: '$totalProfit' },
                totalCost: { $sum: '$totalCost' },
                avgInvoiceValue: { $avg: '$total' },
                cashInvoices: {
                    $sum: { $cond: [{ $eq: ['$type', 'cash'] }, 1, 0] }
                },
                creditInvoices: {
                    $sum: { $cond: [{ $eq: ['$type', 'credit'] }, 1, 0] }
                },
                pendingInvoices: {
                    $sum: { $cond: [{ $eq: ['$type', 'pending'] }, 1, 0] }
                }
            }
        }
    ]);
    
    return stats[0] || {
        totalInvoices: 0,
        totalAmount: 0,
        totalProfit: 0,
        totalCost: 0,
        avgInvoiceValue: 0,
        cashInvoices: 0,
        creditInvoices: 0,
        pendingInvoices: 0
    };
};

const Invoice = mongoose.model('Invoice', InvoiceSchema);

module.exports = Invoice;

module.exports = Invoice;
