const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * JournalEntry — the heart of double-entry bookkeeping.
 *
 * Each entry has N line items (minimum 2). The sum of debits MUST equal credits.
 * Every financial event (fee payment, expense, salary, advance) creates a journal entry.
 *
 * entryType maps to the source:
 *   FEE_RECEIPT   — student fee payment
 *   EXPENSE       — school operational expense
 *   SALARY        — teacher/staff salary payment
 *   ADVANCE       — advance fee received
 *   TRANSFER      — inter-account transfer (bank↔cash)
 *   ADJUSTMENT    — manual accounting adjustment
 *   OPENING       — opening balance entry
 *   REFUND        — credit wallet refund
 */
const journalLineSchema = mongoose.Schema({
  accountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AccountHead',
    required: true,
  },
  debit: {
    type: Number,
    default: 0,
    min: 0,
  },
  credit: {
    type: Number,
    default: 0,
    min: 0,
  },
  description: {
    type: String,
    trim: true,
  },
}, { _id: false });

const journalEntrySchema = mongoose.Schema(
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
      index: true,
    },
    // Auto-incrementing: JV-000001
    entryNumber: {
      type: String,
      trim: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    entryType: {
      type: String,
      enum: [
        // School
        'FEE_RECEIPT', 'SALARY', 'ADVANCE',
        // Generic / retail
        'EXPENSE', 'TRANSFER', 'ADJUSTMENT', 'OPENING', 'REFUND',
        'SALE', 'PURCHASE', 'COGS', 'PAYMENT_IN', 'PAYMENT_OUT',
        'SALES_RETURN', 'PURCHASE_RETURN',
      ],
      required: true,
    },
    lines: {
      type: [journalLineSchema],
      validate: {
        validator: function (lines) {
          if (!lines || lines.length < 2) return false;
          const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
          const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
          return Math.abs(totalDebit - totalCredit) < 0.01;
        },
        message: 'Journal entry must have at least 2 lines and total debit must equal total credit.',
      },
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    narration: {
      type: String,
      trim: true,
    },
    // Link to source document
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    referenceModel: {
      type: String,
      enum: [
        'FeeVoucher', 'SchoolTransaction', 'TeacherPayroll', 'StudentCreditLedger',
        'Invoice', 'Purchase', 'Expense', 'CustomerLedger', 'SupplierLedger',
        'SalesReturn', 'PurchaseReturn', 'Payroll', 'BillPayment',
        'LoadTransaction', 'LoadPurchase', 'SimSale', 'RepairJob',
        'InstallmentPayment', 'CashWithdrawal',
        null,
      ],
    },
    // Financial year tag
    financialYear: {
      type: String, // e.g. "2025-2026"
      index: true,
    },
    status: {
      type: String,
      enum: ['posted', 'draft', 'reversed'],
      default: 'posted',
    },
    reversalOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JournalEntry',
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

journalEntrySchema.plugin(toJSON);
journalEntrySchema.plugin(paginate);

journalEntrySchema.index({ organizationId: 1, branchId: 1, date: -1 });
journalEntrySchema.index({ organizationId: 1, branchId: 1, entryType: 1, date: -1 });
journalEntrySchema.index({ organizationId: 1, branchId: 1, 'lines.accountId': 1, date: -1 });
journalEntrySchema.index({ organizationId: 1, branchId: 1, financialYear: 1 });

// Auto-generate entryNumber
journalEntrySchema.pre('save', async function (next) {
  if (this.isNew && !this.entryNumber) {
    try {
      const result = await mongoose.connection.db
        .collection('_sequences')
        .findOneAndUpdate(
          { _id: `journalEntry_${this.organizationId}_${this.branchId || 'default'}` },
          { $inc: { seq: 1 } },
          { upsert: true, returnDocument: 'after' }
        );
      const seq = Number(result?.seq ?? result?.value?.seq);
      if (!Number.isFinite(seq) || seq <= 0) {
        this.entryNumber = `JV-${Date.now().toString().slice(-6)}`;
      } else {
        this.entryNumber = `JV-${String(seq).padStart(6, '0')}`;
      }
    } catch (err) {
      this.entryNumber = `JV-${Date.now().toString().slice(-6)}`;
    }
  }
  next();
});

const JournalEntry = mongoose.model('JournalEntry', journalEntrySchema);

module.exports = JournalEntry;
