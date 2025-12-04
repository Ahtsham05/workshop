const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

const expenseSchema = new mongoose.Schema({
  expenseNumber: {
    type: String,
    unique: true,
    sparse: true,
  },
  category: {
    type: String,
    required: true,
    enum: [
      'Rent',
      'Utilities',
      'Salaries',
      'Transportation',
      'Marketing',
      'Supplies',
      'Maintenance',
      'Insurance',
      'Tax',
      'Other'
    ],
  },
  description: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Bank Transfer', 'Card', 'Cheque'],
    default: 'Cash',
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
  },
  vendor: {
    type: String,
  },
  reference: {
    type: String,
  },
  notes: {
    type: String,
  },
  attachments: [{
    url: { type: String },
    publicId: { type: String },
    filename: { type: String },
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

// Add plugins
expenseSchema.plugin(toJSON);
expenseSchema.plugin(paginate);

// Generate expense number
expenseSchema.pre('save', async function(next) {
  if (this.isNew && !this.expenseNumber) {
    const count = await mongoose.models.Expense.countDocuments();
    this.expenseNumber = `EXP-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

const Expense = mongoose.model('Expense', expenseSchema);

module.exports = Expense;
