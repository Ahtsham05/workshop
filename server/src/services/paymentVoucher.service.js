const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { PaymentVoucher, Wallet, Expense, Supplier } = require('../models');
const ApiError = require('../utils/ApiError');
const cashBookService = require('./cashBook.service');
const walletEntryService = require('./walletEntry.service');
const expenseService = require('./expense.service');
const supplierLedgerService = require('./supplierLedger.service');
const voucherEdit = require('./voucherEdit');

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
 *
 * The Wallet side goes FIRST. For a cash-type account its sufficiency check reads the live
 * Cash Book balance, so posting the Cash Book entry first would subtract the same payment
 * twice (once from the entry, once from the amount being deducted) and reject payments the
 * till can actually cover.
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

  // Each step undoes itself if the next one fails, so a line is either fully posted or not at all
  // — an edit's rollback only knows about lines that finished.
  try {
    await walletEntryService.syncWalletPayment({
      ...commonFields,
      direction: 'out',
      amount: line.amount,
      paymentMethod: 'wallet',
      walletType: voucher.bankAccountName,
      description,
      date,
      createdBy: voucher.createdBy,
      updatedBy: voucher.updatedBy,
    });
  } catch (error) {
    // The ledger row is written before the balance moves; if the move is what failed, don't
    // leave a row for money that never left.
    await walletEntryService.deleteEntriesByReference(line._id, 'PaymentVoucher');
    throw error;
  }

  try {
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
  } catch (error) {
    await walletEntryService.reverseWalletPayment({
      ...commonFields,
      direction: 'out',
      amount: line.amount,
      paymentMethod: 'wallet',
      walletType: voucher.bankAccountName,
      userId: voucher.updatedBy || voucher.createdBy,
    });
    throw error;
  }
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

/**
 * Post every ledger record one line owns, recording the ids of the ones a later reversal has
 * to find (`expenseId` / `supplierLedgerEntryId`) on the line. `voucher` only needs the header
 * fields (number, date, account name, reference, notes, createdBy...), so an edit can pass the
 * voucher as it WILL be (or as it WAS) without touching the stored document.
 */
const postLine = async (voucher, line, isCashAccount) => {
  if (line.payeeType === 'expense') {
    await syncLineCashEntry(voucher, line, isCashAccount);
    try {
      line.expenseId = await syncExpenseForLine(voucher, line, isCashAccount);
    } catch (error) {
      await reverseLine(voucher, line);
      throw error;
    }
  } else if (line.payeeType === 'supplier') {
    line.supplierLedgerEntryId = await syncSupplierLine(voucher, line);
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
  if (line.payeeType === 'supplier') {
    if (line.supplierLedgerEntryId) {
      await supplierLedgerService.deleteLedgerEntry(line.supplierLedgerEntryId);
    }
    return;
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
    userId: voucher.updatedBy || voucher.createdBy,
  });

  if (line.payeeType === 'expense') {
    await Expense.deleteMany({ referenceId: line._id, referenceModel: 'PaymentVoucher' });
  }
};

/**
 * Rewrite only the wording on the records a line already owns (its description, and the
 * voucher's reference/notes where a record carries them). No amount, date or account is
 * involved, so nothing here moves a balance — which is the whole point of not re-posting a
 * line just because someone fixed a typo.
 */
const annotateLine = async (voucher, existing, line) => {
  const description = lineDescription(voucher, line);

  if (line.payeeType === 'supplier') {
    if (existing.supplierLedgerEntryId) {
      // Not updateLedgerEntry: that one reverses and re-applies the wallet effect, which would
      // move (and can refuse to move) money for what is only a correction of wording.
      await supplierLedgerService.updateLedgerEntryText(existing.supplierLedgerEntryId, {
        description,
        reference: voucher.reference || '',
        notes: voucher.notes || '',
      });
    }
    return;
  }

  await cashBookService.updateDescriptionByReference(line._id, 'PaymentVoucher', description);
  await walletEntryService.updateDescriptionByReference(line._id, 'PaymentVoucher', description);
  if (line.payeeType === 'expense') {
    await Expense.updateMany(
      { referenceId: line._id, referenceModel: 'PaymentVoucher' },
      { $set: { description, reference: voucher.reference || '', notes: voucher.notes || '' } }
    );
  }
};

/** Where a line's bank-side WalletEntry lives — used to refuse edits to reconciled entries. */
const paymentLegRef = (line) =>
  line.payeeType === 'supplier'
    ? { referenceModel: 'SupplierLedger', referenceId: line.supplierLedgerEntryId }
    : { referenceModel: 'PaymentVoucher', referenceId: line._id };

const reverseVoucherLines = async (voucher) => {
  for (const line of voucher.lines) {
    await reverseLine(voucher, line);
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

  // Checked up front: the real check fires per line, after earlier lines (and, for a supplier
  // line, its ledger entry) are already posted — a voucher that can't be afforded used to leave
  // a half-posted voucher behind along with the error.
  await voucherEdit.assertSufficientFunds({ wallet, needed: totalAmount });

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

/**
 * @param {ObjectId} id
 * @param {Object} [scope] - `{ organizationId, branchId }` from the request. Always pass it from
 *   a controller: without it any caller who knows a voucher id could reach another
 *   organization's voucher.
 */
const getVoucherById = async (id, scope = {}) => {
  return PaymentVoucher.findOne({ _id: id, ...scope });
};

/** Same voucher with `createdBy` / `updatedBy` resolved to names, for the detail view. */
const getVoucherDetailById = async (id, scope = {}) => {
  return PaymentVoucher.findOne({ _id: id, ...scope })
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
  existing.payeeType !== line.payeeType ||
  !voucherEdit.sameAmount(existing.amount, line.amount) ||
  (line.payeeType === 'expense' && !voucherEdit.sameText(existing.category, line.category)) ||
  (line.payeeType === 'supplier' && !voucherEdit.sameId(existing.supplierId, line.supplierId));

/** Build the stored shape of one submitted line, keeping what is already known about an
 * unchanged supplier instead of asking for it again. */
const resolveEditedLine = async (input, existing, voucher) => {
  const unchangedSupplier =
    existing &&
    input.payeeType === 'supplier' &&
    existing.payeeType === 'supplier' &&
    voucherEdit.sameId(existing.supplierId, input.supplierId);

  const payeeName = unchangedSupplier
    ? existing.payeeName
    : await resolveLinePayeeName(input, voucher.organizationId, voucher.branchId);

  return {
    _id: existing ? existing._id : new mongoose.Types.ObjectId(),
    payeeType: input.payeeType,
    category: input.payeeType === 'expense' ? input.category : undefined,
    supplierId: input.payeeType === 'supplier' ? input.supplierId : undefined,
    supplierName: input.payeeType === 'supplier' ? (unchangedSupplier ? existing.supplierName : payeeName) : undefined,
    payeeName,
    amount: Number(input.amount),
    description: input.description || undefined,
  };
};

/**
 * Edit a Payment Voucher in place — same id, same voucher number, new contents.
 *
 * Lines are matched to the stored ones by `id`. Only what actually changed is touched: a line
 * whose amount / payee / the voucher's date or account changed has its ledger entries reversed
 * and posted again; a line that only got a new description has its wording rewritten with no
 * balance movement; an untouched line is left exactly as it is. Everything that can be
 * refused (unknown account/supplier, a reconciled bank entry, not enough balance) is refused
 * before the first write.
 *
 * @param {ObjectId} voucherId
 * @param {Object} scope - `{ organizationId, branchId }` from the request
 * @param {Object} body - same shape as create; each line may carry the `id` of the line it edits
 * @param {ObjectId} userId
 * @returns {Promise<PaymentVoucher>}
 */
const updateVoucher = async (voucherId, scope, body, userId) => {
  const voucher = await getVoucherById(voucherId, scope);
  if (!voucher) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payment voucher not found');
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
  // A legs' wallet is addressed by name; an account that is merely the same one keeps its name.
  const nextAccountName = accountChanged ? wallet.type : voucher.bankAccountName;

  const existingById = new Map(voucher.lines.map((line) => [String(line._id), line]));
  const claimed = new Set();
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
    pairs.push({ existing, line: await resolveEditedLine(input, existing, voucher) });
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
    textChanged: (existing, line) =>
      wordingChanged ||
      !voucherEdit.sameText(existing.description, line.description) ||
      (line.payeeType === 'other' && !voucherEdit.sameText(existing.payeeName, line.payeeName)),
  });

  // Lines that are staying as they are keep the ids of the records they already own.
  const replaced = new Set(plan.replaced);
  pairs.forEach((pair) => {
    if (pair.existing && !replaced.has(pair)) {
      pair.line.expenseId = pair.existing.expenseId;
      pair.line.supplierLedgerEntryId = pair.existing.supplierLedgerEntryId;
    }
  });

  const toReverse = [...plan.removed, ...plan.replaced.map((pair) => pair.existing)];
  const toPost = [...plan.replaced, ...plan.added].map((pair) => pair.line);

  await voucherEdit.assertLegsNotReconciled({
    organizationId,
    branchId,
    lines: toReverse,
    legRef: paymentLegRef,
    describe: (line) => `The payment to ${line.payeeName}`,
  });

  // Reversal happens first, so the amounts being taken back are available again to the lines
  // being posted — but only in the account they are posted from. Two cash-type accounts share
  // one Cash Book balance, so moving between them still gets the credit.
  const sharesSpendableBalance =
    !accountChanged || (wallet.accountType === 'cash' && previousWallet?.accountType === 'cash');
  await voucherEdit.assertSufficientFunds({
    wallet,
    needed: voucherEdit.sumAmounts(toPost),
    credit: sharesSpendableBalance ? voucherEdit.sumAmounts(toReverse) : 0,
  });

  // Schema-level problems must surface now, not after the ledgers have moved.
  await new PaymentVoucher({
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
        PaymentVoucher.updateOne(
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
    // Undoing a failed edit posts the old lines again, which gives any supplier/expense line a
    // NEW ledger record. The stored voucher must point at it, or a later delete would go looking
    // for the one that no longer exists.
    if (voucher.isModified()) {
      await voucher.save().catch(() => {});
    }
    throw error;
  }

  return getVoucherDetailById(voucherId, scope);
};

/**
 * Void a payment voucher — reverses every line's Cash Book/Wallet legs (or Supplier Ledger
 * entry) and any mirrored Expense, then removes the voucher record.
 * @param {ObjectId} voucherId
 * @param {Object} [scope] - `{ organizationId, branchId }` from the request
 * @returns {Promise<PaymentVoucher>}
 */
const deleteVoucherById = async (voucherId, scope = {}) => {
  const voucher = await getVoucherById(voucherId, scope);
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
  getVoucherDetailById,
  updateVoucher,
  deleteVoucherById,
};
