const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const InvoiceSchema = new mongoose.Schema({
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true }, // Reference to the Sale
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true }, // Reference to the Customer
    items: [
        {
            product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true }, // Product from the sale
            quantity: { type: Number, required: true }, // Quantity of the product in the sale
            salePrice: { type: Number, required: true }, // Sale price of the product
            purchasePrice: { type: Number, required: true }, // Purchase price of the product
            totalSale: { type: Number, required: true }, // Sale price * quantity
            totalProfit: { type: Number, required: true } // Profit = (Sale price - Purchase price) * quantity
        }
    ],
    totalAmount: { type: Number, required: true }, // Total amount of the invoice (sum of item totals)
    totalProfit: { type: Number, required: true }, // Total profit from the sale (sum of item profits)
    invoiceDate: { type: Date, default: Date.now },
},{
    timestamps: true
});

// add plugin that converts mongoose to json
InvoiceSchema.plugin(toJSON);
InvoiceSchema.plugin(paginate);

// Method to calculate the total profit for the invoice
InvoiceSchema.methods.calculateProfit = function() {
    let totalProfit = 0;
    this.items.forEach(item => {
        totalProfit += item.totalProfit; // Sum of item profits
    });
    this.totalProfit = totalProfit;
    this.totalAmount = this.items.reduce((acc, item) => acc + item.totalSale, 0);
    return totalProfit;
};

const Invoice = mongoose.model('Invoice', InvoiceSchema);

module.exports = Invoice;
