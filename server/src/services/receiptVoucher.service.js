const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { ReceiptVoucher, Wallet, Customer } = require('../models');
const ApiError = require('../utils/ApiError');
const cashBookService = require('./cashBook.service');
const walletEntryService = require('./walletEntry.service');
const customerLedgerService = require('./customerLedger.service');
const voucherEdit = require('./voucherEdit');

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

  // A line is either fully posted or not at all — an edit's rollback only knows about lines that
  // finished — so a failure here takes the Cash Book entry back out.
  try {
    await walletEntryService.syncWalletPayment({
      ...commonFields,
      direction: 'in',
      amount: line.amount,
      paymentMethod: 'wallet',
      walletType: voucher.bankAccountName,
      description,
      date,
      createdBy: voucher.createdBy,
      updatedBy: voucher.updatedBy,
    });
  } catch (error) {
    // The ledger row is written before the balance moves, so remove it too.
    await walletEntryService.deleteEntriesByReference(line._id, 'ReceiptVoucher');
    await cashBookService.deleteEntriesByReference(line._id, 'ReceiptVoucher');
    throw error;
  }
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

/**
 * Post every ledger record one line owns, recording the id a later reversal has to find
 * (`customerLedgerEntryId`) on the line. `voucher` only needs the header fields, so an edit can
 * pass the voucher as it WILL be (or as it WAS) without touching the stored document.
 */
const postLine = async (voucher, line, isCashAccount) => {
  if (line.sourceType === 'customer') {
    line.customerLedgerEntryId = await syncCustomerLine(voucher, line);
  } else {
    await syncLineCashEntry(voucher, line, isCashAccount);
  }
};

const syncVoucherLines = async (voucher, isCashAccount) => {
  for (const line of voucher.lines) {
    await postLine(voucher, line, isCashAccount);
  }
  await voucher.save();
};

/** Undo everything `postLine` did for one line. `voucher.bankAccountName` must be the account
 * the line was posted against. */
const reverseLine = async (voucher, line) => {
  if (line.sourceType === 'customer') {
    if (line.customerLedgerEntryId) {
      await customerLedgerService.deleteLedgerEntry(line.customerLedgerEntryId);
    }
    return;
  }

  // Wallet side first: taking money back out of a cash-type account is checked against the live
  // Cash Book balance, so deleting the Cash Book entry first would subtract this receipt twice
  // and refuse to reverse a receipt the till can easily cover. Doing it in this order also means
  // a refusal happens before anything is deleted.
  await walletEntryService.reverseWalletPayment({
    organizationId: voucher.organizationId,
    branchId: voucher.branchId,
    referenceId: line._id,
    referenceModel: 'ReceiptVoucher',
    direction: 'in',
    amount: line.amount,
    paymentMethod: 'wallet',
    walletType: voucher.bankAccountName,
    userId: voucher.updatedBy || voucher.createdBy,
  });
  await cashBookService.deleteEntriesByReference(line._id, 'ReceiptVoucher');
};

/**
 * Rewrite only the wording on the records a line already owns. No amount, date or account is
 * involved, so nothing here moves a balance.
 */
const annotateLine = async (voucher, existing, line) => {
  const description = lineDescription(voucher, line);

  if (line.sourceType === 'customer') {
    if (existing.customerLedgerEntryId) {
      // Not updateLedgerEntry: that one starts by deducting the received amount back out of the
      // account, which fails once the money has been spent — for a mere correction of wording.
      await customerLedgerService.updateLedgerEntryText(existing.customerLedgerEntryId, {
        description,
        notes: voucher.notes || '',
      });
    }
    return;
  }

  await cashBookService.updateDescriptionByReference(line._id, 'ReceiptVoucher', description);
  await walletEntryService.updateDescriptionByReference(line._id, 'ReceiptVoucher', description);
};

/** Where a line's bank-side WalletEntry lives — used to refuse edits to reconciled entries. */
const receiptLegRef = (line) =>
  line.sourceType === 'customer'
    ? { referenceModel: 'CustomerLedger', referenceId: line.customerLedgerEntryId }
    : { referenceModel: 'ReceiptVoucher', referenceId: line._id };

const reverseVoucherLines = async (voucher) => {
  for (const line of voucher.lines) {
    await reverseLine(voucher, line);
  }
};

/** Who paid: the customer's name, or the income category label. Customers are looked up once
 * per submission via `cache`. */
const resolveLinePayerName = async (line, organizationId, cache) => {
  if (line.sourceType !== 'customer') {
    return { payerName: line.category };
  }
  if (!cache.has(String(line.customerId))) {
    const customer = await Customer.findOne({ _id: line.customerId, organizationId }).select('name');
    if (!customer) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
    }
    cache.set(String(line.customerId), customer);
  }
  const customer = cache.get(String(line.customerId));
  return { payerName: customer.name, customerName: customer.name };
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
    lines.push({ ...line, ...(await resolveLinePayerName(line, voucherBody.organizationId, customerCache)) });
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

/**
 * @param {ObjectId} id
 * @param {Object} [scope] - `{ organizationId, branchId }` from the request. Always pass it from
 *   a controller: without it any caller who knows a voucher id could reach another
 *   organization's voucher.
 */
const getVoucherById = async (id, scope = {}) => {
  return ReceiptVoucher.findOne({ _id: id, ...scope });
};

/** Same voucher with `createdBy` / `updatedBy` resolved to names, for the detail view. */
const getVoucherDetailById = async (id, scope = {}) => {
  return ReceiptVoucher.findOne({ _id: id, ...scope })
    .populate('createdBy', 'name email')
    .populate('updatedBy', 'name email');
};

const headerOf = (voucher) => ({
  organizationId: voucher.organizationId,
  branchId: voucher.branchId,
  voucherNumber: voucher.voucherNumber,
  date: voucher.date,
  createdAt: voucher.createdAt,
  bankAccountName: voucher.bankAccountName,
  reference: voucher.reference,
  notes: voucher.notes,
  createdBy: voucher.createdBy,
  updatedBy: voucher.updatedBy,
});

const lineMoneyChanged = (existing, line) =>
  existing.sourceType !== line.sourceType ||
  !voucherEdit.sameAmount(existing.amount, line.amount) ||
  (line.sourceType === 'income' && !voucherEdit.sameText(existing.category, line.category)) ||
  (line.sourceType === 'customer' && !voucherEdit.sameId(existing.customerId, line.customerId));

/** Build the stored shape of one submitted line, keeping what is already known about an
 * unchanged customer instead of asking for it again. */
const resolveEditedLine = async (input, existing, voucher, customerCache) => {
  const unchangedCustomer =
    existing &&
    input.sourceType === 'customer' &&
    existing.sourceType === 'customer' &&
    voucherEdit.sameId(existing.customerId, input.customerId);

  const names = unchangedCustomer
    ? { payerName: existing.payerName, customerName: existing.customerName }
    : await resolveLinePayerName(input, voucher.organizationId, customerCache);

  return {
    _id: existing ? existing._id : new mongoose.Types.ObjectId(),
    sourceType: input.sourceType,
    category: input.sourceType === 'income' ? input.category : undefined,
    customerId: input.sourceType === 'customer' ? input.customerId : undefined,
    customerName: input.sourceType === 'customer' ? names.customerName : undefined,
    payerName: names.payerName,
    amount: Number(input.amount),
    description: input.description || undefined,
  };
};

/**
 * Edit a Receipt Voucher in place — same id, same voucher number, new contents. Mirrors
 * `paymentVoucher.service.js`'s `updateVoucher` (read that for the full reasoning): lines are
 * matched by `id`, only what actually changed is re-posted, and everything that can be refused
 * is refused before the first write.
 *
 * The direction matters for the balance check. Editing a receipt reverses the old amounts
 * OUT of the account they were received into before posting the new ones, so what must be
 * affordable is the reversal, against the OLD account — the money may already have been spent.
 *
 * @param {ObjectId} voucherId
 * @param {Object} scope - `{ organizationId, branchId }` from the request
 * @param {Object} body - same shape as create; each line may carry the `id` of the line it edits
 * @param {ObjectId} userId
 * @returns {Promise<ReceiptVoucher>}
 */
const updateVoucher = async (voucherId, scope, body, userId) => {
  const voucher = await getVoucherById(voucherId, scope);
  if (!voucher) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Receipt voucher not found');
  }
  const { organizationId, branchId } = voucher;

  const [wallet, previousWallet] = await Promise.all([
    Wallet.findOne({ _id: body.bankAccountId, organizationId, branchId }),
    Wallet.findOne({ _id: voucher.bankAccountId, organizationId, branchId }),
  ]);
  if (!wallet) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Bank account not found');
  }

  const nextDate = body.date !== undefined ? new Date(body.date) : voucher.date;
  const nextReference = body.reference !== undefined ? body.reference : voucher.reference;
  const nextNotes = body.notes !== undefined ? body.notes : voucher.notes;
  const accountChanged = !voucherEdit.sameId(voucher.bankAccountId, wallet._id);
  const headerMoneyChanged = accountChanged || new Date(nextDate).getTime() !== new Date(voucher.date).getTime();
  const wordingChanged =
    !voucherEdit.sameText(nextReference, voucher.reference) || !voucherEdit.sameText(nextNotes, voucher.notes);
  // A leg's wallet is addressed by name; an account that is merely the same one keeps its name.
  const nextAccountName = accountChanged ? wallet.type : voucher.bankAccountName;

  const existingById = new Map(voucher.lines.map((line) => [String(line._id), line]));
  const claimed = new Set();
  const customerCache = new Map();
  const pairs = [];
  for (const input of body.lines) {
    let existing;
    if (input.id) {
      existing = existingById.get(String(input.id));
      if (!existing) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'A submitted line does not belong to this voucher');
      }
      if (claimed.has(String(input.id))) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'The same voucher line was submitted twice');
      }
      claimed.add(String(input.id));
    }
    pairs.push({ existing, line: await resolveEditedLine(input, existing, voucher, customerCache) });
  }

  const totalAmount = voucherEdit.sumAmounts(pairs.map((pair) => pair.line));
  if (totalAmount <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Voucher total must be greater than zero');
  }

  const plan = voucherEdit.planLineChanges({
    existingLines: voucher.lines,
    pairs,
    headerMoneyChanged,
    moneyChanged: lineMoneyChanged,
    textChanged: (existing, line) => wordingChanged || !voucherEdit.sameText(existing.description, line.description),
  });

  // Lines that are staying as they are keep the id of the record they already own.
  const replaced = new Set(plan.replaced);
  pairs.forEach((pair) => {
    if (pair.existing && !replaced.has(pair)) {
      pair.line.customerLedgerEntryId = pair.existing.customerLedgerEntryId;
    }
  });

  const toReverse = [...plan.removed, ...plan.replaced.map((pair) => pair.existing)];

  await voucherEdit.assertLegsNotReconciled({
    organizationId,
    branchId,
    lines: toReverse,
    legRef: receiptLegRef,
    describe: (line) => `The receipt from ${line.payerName}`,
  });

  // Nothing to check if the old account no longer exists — the reversal just re-creates it.
  if (previousWallet) {
    await voucherEdit.assertSufficientFunds({ wallet: previousWallet, needed: voucherEdit.sumAmounts(toReverse) });
  }

  // Schema-level problems must surface now, not after the ledgers have moved.
  await new ReceiptVoucher({
    ...voucher.toObject(),
    date: nextDate,
    bankAccountId: wallet._id,
    bankAccountName: nextAccountName,
    lines: pairs.map((pair) => pair.line),
    totalAmount,
  }).validate();

  const previousHeader = headerOf(voucher);
  const nextHeader = {
    ...previousHeader,
    date: nextDate,
    bankAccountName: nextAccountName,
    reference: nextReference,
    notes: nextNotes,
    updatedBy: userId,
  };
  const previousIsCash = previousWallet?.accountType === 'cash';
  const nextIsCash = wallet.accountType === 'cash';

  try {
    await voucherEdit.executeLineChanges({
      plan,
      voucherNumber: voucher.voucherNumber,
      previous: {
        reverse: (line) => reverseLine(previousHeader, line),
        post: (line) => postLine(previousHeader, line, previousIsCash),
      },
      next: {
        reverse: (line) => reverseLine(nextHeader, line),
        post: (line) => postLine(nextHeader, line, nextIsCash),
      },
      annotate: (existing, line) => annotateLine(nextHeader, existing, line),
      persist: () =>
        ReceiptVoucher.updateOne(
          { _id: voucher._id },
          {
            $set: {
              date: nextDate,
              bankAccountId: wallet._id,
              bankAccountName: nextAccountName,
              reference: nextReference,
              notes: nextNotes,
              lines: pairs.map((pair) => pair.line),
              totalAmount,
              updatedBy: userId,
            },
          }
        ),
    });
  } catch (error) {
    // Undoing a failed edit posts the old lines again, which gives any customer line a NEW ledger
    // record. The stored voucher must point at it, or a later delete would go looking for the one
    // that no longer exists.
    if (voucher.isModified()) {
      await voucher.save().catch(() => {});
    }
    throw error;
  }

  return getVoucherDetailById(voucherId, scope);
};

/**
 * Void a receipt voucher — reverses the Cash Book/Wallet legs (income lines) or the
 * Customer Ledger entry (customer lines), then removes the voucher record.
 * @param {ObjectId} voucherId
 * @param {Object} [scope] - `{ organizationId, branchId }` from the request
 * @returns {Promise<ReceiptVoucher>}
 */
const deleteVoucherById = async (voucherId, scope = {}) => {
  const voucher = await getVoucherById(voucherId, scope);
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
  getVoucherDetailById,
  updateVoucher,
  deleteVoucherById,
};
