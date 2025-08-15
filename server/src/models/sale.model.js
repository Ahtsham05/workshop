const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const SaleSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  invoiceNumber: { type: String, required: true, unique: true },
  items: [
    {
      product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      quantity: { type: Number, required: true },
      priceAtSale: { type: Number, required: true }, // Price at the time of sale
      purchasePrice: { type: Number, required: true }, // Purchase price at the time of sale (for profit calculation)
      total: { type: Number, required: true }, // quantity * priceAtSale
      profit: { type: Number, required: true }, // Profit for the item (priceAtSale - purchasePrice) * quantity
    },
  ],
  saleDate: { type: Date, default: Date.now },
  totalAmount: { type: Number, required: true },
  totalProfit: { type: Number, required: true }, // Total profit from all items
  paymentStatus: { type: String, enum: ['paid', 'pending'], default: 'pending' },
  status: { type: Boolean, default: false },
}, {
  timestamps: true,
});

// Method to calculate total profit for the sale
SaleSchema.methods.calculateTotalProfit = function() {
  let totalProfit = 0;
  this.items.forEach(item => {
    item.profit = (item.priceAtSale - item.purchasePrice) * item.quantity; // Profit for each item
    totalProfit += item.profit; // Sum of all item profits
  });
  this.totalProfit = totalProfit;
  this.totalAmount = this.items.reduce((acc, item) => acc + item.total, 0); // Sum of all item totals
  return totalProfit;
};

// Add plugin that converts mongoose to JSON
SaleSchema.plugin(toJSON);
SaleSchema.plugin(paginate);

const Sale = mongoose.model('Sale', SaleSchema);

module.exports = Sale;
