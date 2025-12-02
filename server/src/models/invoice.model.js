const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

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
    image: {
        url: { type: String },
        publicId: { type: String }
    },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    cost: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
    profit: { type: Number, required: true },
    isManualEntry: { type: Boolean, default: false }
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
        enum: ['cash', 'credit', 'pending'], 
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
    
    // Additional charges
    deliveryCharge: { type: Number, default: 0, min: 0 },
    serviceCharge: { type: Number, default: 0, min: 0 },
    roundingAdjustment: { type: Number, default: 0 },
    
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
    
    // Audit fields
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    convertedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
    timestamps: true
});

// add plugin that converts mongoose to json
InvoiceSchema.plugin(toJSON);
InvoiceSchema.plugin(paginate);

// Generate invoice number before saving
InvoiceSchema.pre('save', async function(next) {
    if (this.isNew && !this.invoiceNumber) {
        const count = await mongoose.models.Invoice.countDocuments();
        const year = new Date().getFullYear();
        const month = String(new Date().getMonth() + 1).padStart(2, '0');
        this.invoiceNumber = `INV-${year}${month}-${String(count + 1).padStart(6, '0')}`;
    }
    next();
});

// Method to calculate totals
InvoiceSchema.methods.calculateTotals = function() {
    // Calculate subtotal from items
    this.subtotal = this.items.reduce((sum, item) => sum + item.subtotal, 0);
    
    // Calculate total profit and cost
    this.totalProfit = this.items.reduce((sum, item) => sum + item.profit, 0);
    this.totalCost = this.items.reduce((sum, item) => sum + (item.cost * item.quantity), 0);
    
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
    this.status = 'finalized';
    if (this.type === 'cash' && this.paidAmount >= this.total) {
        this.status = 'paid';
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
