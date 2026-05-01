const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const simSaleSchema = new mongoose.Schema(
  {
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
    jobNumber: {
      type: Number,
      required: true,
      index: true,
    },
    date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    // SIM product
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      index: true,
    },
    productName: {
      type: String,
      trim: true,
      default: '',
    },
    simAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    // Load account (wallet)
    walletType: {
      type: String,
      trim: true,
      default: '',
    },
    loadAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    // Computed fields
    purchaseAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    saleAmount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    commission: {
      type: Number,
      default: 0,
    },
    // Customer info (optional)
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      index: true,
    },
    customerName: {
      type: String,
      trim: true,
      default: '',
    },
    customerMobile: {
      type: String,
      trim: true,
      default: '',
    },
    customerCNIC: {
      type: String,
      trim: true,
      default: '',
    },
    customerLocation: {
      type: String,
      trim: true,
      default: '',
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'bank', 'jazzcash', 'easypaisa', 'wallet'],
      default: 'cash',
    },
    paymentWalletType: {
      type: String,
      trim: true,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

simSaleSchema.plugin(toJSON);
simSaleSchema.plugin(paginate);

simSaleSchema.index({ organizationId: 1, branchId: 1 });
simSaleSchema.index({ organizationId: 1, branchId: 1, date: -1 });
simSaleSchema.index({ organizationId: 1, branchId: 1, jobNumber: 1 }, { unique: true });

const SimSale = mongoose.model('SimSale', simSaleSchema);

module.exports = SimSale;
