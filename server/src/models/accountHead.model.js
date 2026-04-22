const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * Chart of Accounts — hierarchical account heads.
 *
 * rootType drives accounting equation:
 *   ASSET       — things the school owns (cash, bank, receivables, equipment)
 *   LIABILITY   — what the school owes (payables, advances received, loans)
 *   EQUITY      — owner's capital / retained earnings
 *   REVENUE     — fee income, other income
 *   EXPENSE     — salaries, rent, utilities, etc.
 *
 * balanceType:
 *   DEBIT  — Assets, Expenses (natural debit balance)
 *   CREDIT — Liabilities, Equity, Revenue (natural credit balance)
 *
 * Hierarchy:  parentId → allows unlimited nesting.
 *   e.g. Assets → Current Assets → Cash in Hand
 *        Expenses → Salary Expense → Teacher Salary
 *
 * code: unique short-code like "1001", "2001" for quick lookup.
 */
const accountHeadSchema = mongoose.Schema(
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
    code: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    rootType: {
      type: String,
      enum: ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'],
      required: true,
    },
    balanceType: {
      type: String,
      enum: ['DEBIT', 'CREDIT'],
      required: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AccountHead',
      default: null,
      index: true,
    },
    // Depth in tree (0 = root group, 1 = sub-group, 2+ = leaf)
    level: {
      type: Number,
      default: 0,
    },
    // Is this a group (has children) or a posting account (transactions go here)
    isGroup: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
      trim: true,
    },
    // Running balance (updated with each journal entry for fast reads)
    openingBalance: {
      type: Number,
      default: 0,
    },
    currentBalance: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // System accounts can't be deleted (seeded defaults)
    isSystem: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

accountHeadSchema.plugin(toJSON);
accountHeadSchema.plugin(paginate);

accountHeadSchema.index({ organizationId: 1, branchId: 1, code: 1 }, { unique: true });
accountHeadSchema.index({ organizationId: 1, branchId: 1, parentId: 1 });
accountHeadSchema.index({ organizationId: 1, branchId: 1, rootType: 1 });

const AccountHead = mongoose.model('AccountHead', accountHeadSchema);

module.exports = AccountHead;
