const httpStatus = require('http-status');
const { PaymentVoucher, Wallet, Expense, Supplier } = require('../models');
const ApiError = require('../utils/ApiError');
const cashBookService = require('./cashBook.service');
const walletEntryService = require('./walletEntry.service');
const expenseService = require('./expense.service');
const supplierLedgerService = require('./supplierLedger.service');

const lineDescription = (voucher, line) => `Payment voucher ${voucher.voucherNumber} — ${line.payeeName}${line.description ? ` (${line.description})` : ''}`;

/**
 * Mirror an expense-type line into the Expense collection — purely for Expense Report /
 * Profit & Loss visibility (both aggregate off Expense.amount, not Cash Book), NOT a second
 * cash movement: `skipCashBookSync` keeps createExpense from posting its own Cash Book/
 * Wallet/accounts entries, since syncLineCashEntry already recorded the real one. Same
 * pattern salesmanCommissionPayment.service.js uses for commission payouts.
 *
 * `isCashAccount` mirrors the paying Bank Account's own `accountType === 'cash'` — the
 * Expense's own paymentMethod should read "Cash", not "Wallet", when that's genuinely what
 * it is, same reasoning as `syncLineCashEntry`.
 */
const syncExpenseForLine = async (voucher, line, isCashAccount) => {
  const expense = await expenseService.createExpense(
    {
      organizationId: voucher.organizationId,
      branchId: voucher.branchId,
      category: line.category,
      description: lineDescription(voucher, line),
      amount: line.amount,
      paymentMethod: isCashAccount ? 'Cash' : 'Wallet',
      walletType: isCashAccount ? undefined : voucher.bankAccountName,
      date: voucher.date || voucher.createdAt,
      reference: voucher.reference || undefined,
      notes: voucher.notes || '',
      referenceId: line._id,
      referenceModel: 'PaymentVoucher',
      isPaid: true,
      createdBy: voucher.createdBy,
    },
    { skipCashBookSync: true }
  );
  return expense._id;
};

/**
 * Cash Book entry + Wallet balance/ledger movement for one expense/other line.
 *
 * The Wallet side (`walletEntryService.syncWalletPayment`) always uses
 * `paymentMethod: 'wallet'` + `walletType: <bank account name>` regardless of the account's
 * `accountType` — that's what makes *this specific* Bank Account's balance move, whether
 * it's flagged cash/bank/mobile_wallet. The Cash Book side is different: the dedicated Cash
 * Book page/Cash-in-Hand summary only ever count entries with `paymentMethod === 'cash'`
 * (`cashBook.service.js`'s `getCashInHandSummary`), so a payment out of a `accountType:
 * 'cash'` Bank Account (e.g. the default "Cash in Hand" account) needs to be tagged 'cash'
 * there specifically, or it would silently never show up in Cash Book / Track Cash even
 * though it's genuinely cash leaving the till.
 */
const syncLineCashEntry = async (voucher, line, isCashAccount) => {
  const commonFields = {
    organizationId: voucher.organizationId,
    branchId: voucher.branchId,
    referenceId: line._id,
    referenceModel: 'PaymentVoucher',
  };
  const description = lineDescription(voucher, line);
  const date = voucher.date || voucher.createdAt;

  await cashBookService.upsertReferenceEntry({
    ...commonFields,
    type: 'expense',
    source: 'payment_voucher',
    paymentMethod: isCashAccount ? 'cash' : 'wallet',
    amount: line.amount,
    date,
    description,
    createdBy: voucher.createdBy,
  });

  await walletEntryService.syncWalletPayment({
    ...commonFields,
    direction: 'out',
    amount: line.amount,
    paymentMethod: 'wallet',
    walletType: voucher.bankAccountName,
    description,
    date,
    createdBy: voucher.createdBy,
  });
};

/**
 * Post a supplier-payment line straight through the existing Supplier Ledger service — it
 * already owns the wallet/cash-book/accounts sync for a `payment_made` entry (via
 * `syncWalletFromSupplierLedger`/`syncCashBookFromSupplierLedger`/`postSupplierLedgerToAccounts`),
 * so this line must NOT also go through `syncLineCashEntry` or the bank account would be
 * debited twice. `paymentMethod` uses the same `"Wallet (<name>)"` string convention the
 * existing supplier ledger UI (`ledger-entry-form.tsx`) already sends.
 */
const syncSupplierLine = async (voucher, line) => {
  const entry = await supplierLedgerService.createLedgerEntry({
    organizationId: voucher.organizationId,
    branchId: voucher.branchId,
    supplier: line.supplierId,
    transactionType: 'payment_made',
    transactionDate: voucher.date || voucher.createdAt,
    description: lineDescription(voucher, line),
    debit: line.amount,
    credit: 0,
    paymentMethod: `Wallet (${voucher.bankAccountName})`,
    reference: voucher.reference || undefined,
    notes: voucher.notes || '',
  });
  return entry._id;
};

const syncVoucherLines = async (voucher, isCashAccount) => {
  for (const line of voucher.lines) {
    if (line.payeeType === 'expense') {
      await syncLineCashEntry(voucher, line, isCashAccount);
      line.expenseId = await syncExpenseForLine(voucher, line, isCashAccount);
    } else if (line.payeeType === 'supplier') {
      line.supplierLedgerEntryId = await syncSupplierLine(voucher, line);
    } else {
      await syncLineCashEntry(voucher, line, isCashAccount);
    }
  }
  await voucher.save();
};

const reverseVoucherLines = async (voucher) => {
  for (const line of voucher.lines) {
    if (line.payeeType === 'supplier') {
      if (line.supplierLedgerEntryId) {
        await supplierLedgerService.deleteLedgerEntry(line.supplierLedgerEntryId);
      }
      continue;
    }

    await cashBookService.deleteEntriesByReference(line._id, 'PaymentVoucher');
    await walletEntryService.reverseWalletPayment({
      organizationId: voucher.organizationId,
      branchId: voucher.branchId,
      referenceId: line._id,
      referenceModel: 'PaymentVoucher',
      direction: 'out',
      amount: line.amount,
      paymentMethod: 'wallet',
      walletType: voucher.bankAccountName,
      userId: voucher.createdBy,
    });

    if (line.payeeType === 'expense') {
      await Expense.deleteMany({ referenceId: line._id, referenceModel: 'PaymentVoucher' });
    }
  }
};

const resolveLinePayeeName = async (line, orgId, branchId) => {
  if (line.payeeType === 'expense') {
    return line.category;
  }
  if (line.payeeType === 'supplier') {
    const supplier = await Supplier.findOne({ _id: line.supplierId, organizationId: orgId, branchId }).select('name');
    if (!supplier) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found');
    }
    return supplier.name;
  }
  return line.payeeName;
};

/**
 * Record a standalone Payment Voucher (money out) against a Bank Account, distributed
 * across one or more lines (expense category / supplier / other payee).
 * @param {Object} voucherBody
 * @param {ObjectId} userId
 * @returns {Promise<PaymentVoucher>}
 */
const createVoucher = async (voucherBody, userId) => {
  const wallet = await Wallet.findOne({
    _id: voucherBody.bankAccountId,
    organizationId: voucherBody.organizationId,
    branchId: voucherBody.branchId,
  });
  if (!wallet) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Bank account not found');
  }

  if (!Array.isArray(voucherBody.lines) || voucherBody.lines.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A payment voucher needs at least one line');
  }

  const resolvedLines = [];
  for (const line of voucherBody.lines) {
    const payeeName = await resolveLinePayeeName(line, voucherBody.organizationId, voucherBody.branchId);

    resolvedLines.push({
      payeeType: line.payeeType,
      category: line.payeeType === 'expense' ? line.category : undefined,
      supplierId: line.payeeType === 'supplier' ? line.supplierId : undefined,
      supplierName: line.payeeType === 'supplier' ? payeeName : undefined,
      payeeName,
      amount: Number(line.amount),
      description: line.description || undefined,
    });
  }

  const totalAmount = resolvedLines.reduce((sum, line) => sum + line.amount, 0);
  if (totalAmount <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Voucher total must be greater than zero');
  }

  const voucher = await PaymentVoucher.create({
    organizationId: voucherBody.organizationId,
    branchId: voucherBody.branchId,
    date: voucherBody.date,
    bankAccountId: voucherBody.bankAccountId,
    bankAccountName: wallet.type,
    lines: resolvedLines,
    totalAmount,
    reference: voucherBody.reference,
    notes: voucherBody.notes,
    createdBy: userId,
  });

  await syncVoucherLines(voucher, wallet.accountType === 'cash');

  return voucher;
};

/**
 * Query for payment vouchers
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const queryVouchers = async (filter, options) => {
  const opts = { ...options, sortBy: options.sortBy || 'date:desc' };
  return PaymentVoucher.paginate(filter, opts);
};

const getVoucherById = async (id) => {
  return PaymentVoucher.findById(id);
};

/**
 * Void a payment voucher — reverses every line's Cash Book/Wallet legs (or Supplier Ledger
 * entry) and any mirrored Expense, then removes the voucher record.
 * @param {ObjectId} voucherId
 * @returns {Promise<PaymentVoucher>}
 */
const deleteVoucherById = async (voucherId) => {
  const voucher = await PaymentVoucher.findById(voucherId);
  if (!voucher) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payment voucher not found');
  }

  await reverseVoucherLines(voucher);

  await voucher.deleteOne();
  return voucher;
};

module.exports = {
  createVoucher,
  queryVouchers,
  getVoucherById,
  deleteVoucherById,
};
