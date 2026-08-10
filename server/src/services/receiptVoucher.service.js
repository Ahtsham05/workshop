const httpStatus = require('http-status');
const { ReceiptVoucher, Wallet, Customer } = require('../models');
const ApiError = require('../utils/ApiError');
const cashBookService = require('./cashBook.service');
const walletEntryService = require('./walletEntry.service');
const customerLedgerService = require('./customerLedger.service');

const lineDescription = (voucher, line) => `Receipt voucher ${voucher.voucherNumber} — ${line.payerName}${line.description ? ` (${line.description})` : ''}`;

/**
 * Cash Book entry + Wallet balance/ledger movement for one income line.
 *
 * Same accountType-aware tagging as `paymentVoucher.service.js`'s `syncLineCashEntry`: the
 * Wallet side always uses `paymentMethod: 'wallet'` (that's what moves this specific Bank
 * Account's balance), while the Cash Book side is tagged 'cash' only when the account is
 * genuinely cash-type, so the Cash-in-Hand summary picks it up correctly.
 */
const syncLineCashEntry = async (voucher, line, isCashAccount) => {
  const commonFields = {
    organizationId: voucher.organizationId,
    branchId: voucher.branchId,
    referenceId: line._id,
    referenceModel: 'ReceiptVoucher',
  };
  const description = lineDescription(voucher, line);
  const date = voucher.date || voucher.createdAt;

  await cashBookService.upsertReferenceEntry({
    ...commonFields,
    type: 'income',
    source: 'receipt_voucher',
    paymentMethod: isCashAccount ? 'cash' : 'wallet',
    amount: line.amount,
    date,
    description,
    createdBy: voucher.createdBy,
  });

  await walletEntryService.syncWalletPayment({
    ...commonFields,
    direction: 'in',
    amount: line.amount,
    paymentMethod: 'wallet',
    walletType: voucher.bankAccountName,
    description,
    date,
    createdBy: voucher.createdBy,
  });
};

/**
 * Post a customer-payment line straight through the existing Customer Ledger service — it
 * already owns the wallet/cash-book/accounts sync for a `payment_received` entry, so this
 * line must NOT also go through `syncLineCashEntry` or the bank account would be credited
 * twice. `paymentMethod` uses the same `"Wallet (<name>)"` string convention the existing
 * customer ledger UI (`ledger-entry-form.tsx`) already sends.
 */
const syncCustomerLine = async (voucher, line) => {
  const entry = await customerLedgerService.createLedgerEntry({
    organizationId: voucher.organizationId,
    branchId: voucher.branchId,
    customer: line.customerId,
    transactionType: 'payment_received',
    transactionDate: voucher.date || voucher.createdAt,
    description: lineDescription(voucher, line),
    debit: 0,
    credit: line.amount,
    paymentMethod: `Wallet (${voucher.bankAccountName})`,
    notes: voucher.notes || '',
  });
  return entry._id;
};

const syncVoucherLines = async (voucher, isCashAccount) => {
  for (const line of voucher.lines) {
    if (line.sourceType === 'customer') {
      line.customerLedgerEntryId = await syncCustomerLine(voucher, line);
    } else {
      await syncLineCashEntry(voucher, line, isCashAccount);
    }
  }
  await voucher.save();
};

const reverseVoucherLines = async (voucher) => {
  for (const line of voucher.lines) {
    if (line.sourceType === 'customer') {
      if (line.customerLedgerEntryId) {
        await customerLedgerService.deleteLedgerEntry(line.customerLedgerEntryId);
      }
    } else {
      await cashBookService.deleteEntriesByReference(line._id, 'ReceiptVoucher');
      await walletEntryService.reverseWalletPayment({
        organizationId: voucher.organizationId,
        branchId: voucher.branchId,
        referenceId: line._id,
        referenceModel: 'ReceiptVoucher',
        direction: 'in',
        amount: line.amount,
        paymentMethod: 'wallet',
        walletType: voucher.bankAccountName,
        userId: voucher.createdBy,
      });
    }
  }
};

/**
 * Record a standalone Receipt Voucher (money in) against a Bank Account.
 * @param {Object} voucherBody
 * @param {ObjectId} userId
 * @returns {Promise<ReceiptVoucher>}
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

  const customerCache = new Map();
  const lines = [];
  for (const line of voucherBody.lines) {
    if (line.sourceType === 'customer') {
      if (!customerCache.has(line.customerId)) {
        const customer = await Customer.findOne({
          _id: line.customerId,
          organizationId: voucherBody.organizationId,
        }).select('name');
        if (!customer) {
          throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
        }
        customerCache.set(line.customerId, customer);
      }
      const customer = customerCache.get(line.customerId);
      lines.push({ ...line, customerName: customer.name, payerName: customer.name });
    } else {
      lines.push({ ...line, payerName: line.category });
    }
  }

  const voucher = await ReceiptVoucher.create({
    ...voucherBody,
    bankAccountName: wallet.type,
    lines,
    totalAmount: lines.reduce((sum, l) => sum + Number(l.amount || 0), 0),
    createdBy: userId,
  });

  await syncVoucherLines(voucher, wallet.accountType === 'cash');

  return voucher;
};

/**
 * Query for receipt vouchers
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const queryVouchers = async (filter, options) => {
  const opts = { ...options, sortBy: options.sortBy || 'date:desc' };
  return ReceiptVoucher.paginate(filter, opts);
};

const getVoucherById = async (id) => {
  return ReceiptVoucher.findById(id);
};

/**
 * Void a receipt voucher — reverses the Cash Book/Wallet legs (income lines) or the
 * Customer Ledger entry (customer lines), then removes the voucher record.
 * @param {ObjectId} voucherId
 * @returns {Promise<ReceiptVoucher>}
 */
const deleteVoucherById = async (voucherId) => {
  const voucher = await ReceiptVoucher.findById(voucherId);
  if (!voucher) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Receipt voucher not found');
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
