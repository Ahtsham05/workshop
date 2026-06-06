const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const branchSchema = mongoose.Schema(
  {
    organizationId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Organization',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    nameUrdu: {
      type: String,
      trim: true,
      default: '',
    },
    location: {
      address: { type: String, trim: true },
      /** Urdu street / area line for receipts when printing in Urdu */
      addressUrdu: { type: String, trim: true, default: '' },
      city: { type: String, trim: true },
      country: { type: String, trim: true },
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    manager: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    /** Shown at bottom of thermal/HTML receipts & invoices for this branch */
    invoiceNote: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    /**
     * Fee-collection bank accounts shown to parents/students in the portal when
     * paying fees online. Each account is what a parent transfers fees to and
     * then uploads the payment proof against.
     */
    bankAccounts: [
      new mongoose.Schema(
        {
          bankName: { type: String, trim: true },
          accountTitle: { type: String, trim: true },
          accountNumber: { type: String, trim: true },
          iban: { type: String, trim: true },
          instructions: { type: String, trim: true },
          isActive: { type: Boolean, default: true },
        },
        { _id: true }
      ),
    ],
  },
  {
    timestamps: true,
  }
);

branchSchema.plugin(toJSON);
branchSchema.plugin(paginate);

/**
 * @typedef Branch
 */
const Branch = mongoose.model('Branch', branchSchema);

module.exports = Branch;
