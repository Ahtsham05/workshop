const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

const expenseSchema = new mongoose.Schema({
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
  expenseNumber: {
    type: String,
    unique: true,
    sparse: true,
  },
  category: {
    type: String,
    required: true,
    trim: true,
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

expenseSchema.index({ organizationId: 1, branchId: 1 });

// Generate expense number with retry for race conditions
expenseSchema.pre('save', async function(next) {
  if (this.isNew && !this.expenseNumber) {
    const lastExpense = await mongoose.models.Expense.findOne({ expenseNumber: { $exists: true, $ne: null } })
      .sort({ expenseNumber: -1 })
      .select('expenseNumber')
      .lean();
    let nextNum = 1;
    if (lastExpense && lastExpense.expenseNumber) {
      const match = lastExpense.expenseNumber.match(/EXP-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    this.expenseNumber = `EXP-${String(nextNum).padStart(6, '0')}`;
  }
  next();
});

const Expense = mongoose.model('Expense', expenseSchema);

module.exports = Expense;
