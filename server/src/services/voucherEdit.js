const httpStatus = require('http-status');
const { WalletEntry } = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const walletService = require('./wallet.service');

/**
 * The half of "edit a multi-line voucher" that is identical for Payment and Receipt Vouchers.
 * Each voucher service supplies what differs (how one line is posted / reversed / re-labelled,
 * and which ledger records a line owns); this file owns the parts that are easy to get wrong
 * and must behave the same in both:
 *
 *  - deciding, line by line, whether an edit touches MONEY (must re-post), only TEXT (rewrite
 *    the description on the records the line already owns — no balance moves), or nothing;
 *  - refusing, before anything is written, a change that would touch an already-reconciled
 *    bank entry or take an account below zero;
 *  - applying the change reverse-first / post-second, and undoing whatever already completed
 *    if a later step fails (there is no cross-service transaction to lean on here — Cash Book,
 *    Wallet ledger and the Supplier/Customer ledgers are each written by a different service).
 */

const sameText = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();
const sameId = (a, b) => String(a ?? '') === String(b ?? '');
const sameAmount = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;
const sumAmounts = (lines) => lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);

/**
 * Sort every line of an edit into exactly one bucket.
 *
 * `pairs` is the incoming lines in their new order, each as `{ existing, line }` — `existing`
 * is the stored line it edits (undefined for a brand-new line). A stored line that no incoming
 * line points at was removed.
 *
 *  - added:     new line → post it
 *  - removed:   dropped line → reverse it
 *  - replaced:  money changed (or the voucher's date/account did, which every line depends on)
 *               → reverse the old legs, post new ones
 *  - annotated: only wording changed → rewrite text on the existing records, no money moves
 *  - anything else is untouched — a no-op edit must not disturb the ledgers at all.
 */
const planLineChanges = ({ existingLines, pairs, headerMoneyChanged, moneyChanged, textChanged }) => {
  const kept = new Set(pairs.filter((pair) => pair.existing).map((pair) => String(pair.existing._id)));
  const removed = existingLines.filter((line) => !kept.has(String(line._id)));
  const added = pairs.filter((pair) => !pair.existing);
  const replaced = pairs.filter((pair) => pair.existing && (headerMoneyChanged || moneyChanged(pair.existing, pair.line)));
  const replacedSet = new Set(replaced);
  const annotated = pairs.filter(
    (pair) => pair.existing && !replacedSet.has(pair) && textChanged(pair.existing, pair.line)
  );
  return { added, removed, replaced, annotated };
};

/**
 * A reconciled bank entry has been ticked off against a real bank statement. Re-posting it
 * would create a fresh, unreconciled entry and silently break that reconciliation's balance,
 * so any line whose entry is reconciled can't be reversed or replaced until it is unreconciled.
 *
 * `legRef(line)` returns the `{ referenceModel, referenceId }` the line's WalletEntry is
 * stored under (a Payment Voucher line posts it under its own id; a supplier line's belongs to
 * the Supplier Ledger entry it created), or null when it has none.
 */
const assertLegsNotReconciled = async ({ organizationId, branchId, lines, legRef, describe }) => {
  const refs = lines.map((line) => ({ line, ref: legRef(line) })).filter((item) => item.ref && item.ref.referenceId);
  if (refs.length === 0) return;

  const hit = await WalletEntry.findOne({
    organizationId,
    branchId,
    isReconciled: true,
    $or: refs.map(({ ref }) => ({ referenceModel: ref.referenceModel, referenceId: ref.referenceId })),
  }).select('referenceId referenceModel');
  if (!hit) return;

  const culprit = refs.find(
    ({ ref }) => ref.referenceModel === hit.referenceModel && sameId(ref.referenceId, hit.referenceId)
  );
  throw new ApiError(
    httpStatus.CONFLICT,
    `${describe(culprit.line)} has already been matched in Bank Reconciliation, so it can't be changed. Unreconcile it first, then edit the voucher.`
  );
};

/**
 * Refuse — before anything is written — a change that would take `wallet` below zero. Uses the
 * same balance rule `adjustWalletBalance` enforces, so this can only reject what the real check
 * would have rejected anyway; the difference is that it does so while nothing has been touched
 * yet (the real check fires mid-way, after earlier legs are already posted).
 *
 * `credit` is money the edit itself hands back to this account first (the old amounts of lines
 * being reversed), since reversal happens before re-posting.
 */
const assertSufficientFunds = async ({ wallet, needed, credit = 0 }) => {
  if (!(needed > 0)) return;
  const available = Number(await walletService.resolveSpendableBalance(wallet)) + credit;
  if (needed > available + 0.001) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `${wallet.type} wallet balance is insufficient (available ${available.toFixed(2)}, needed ${needed.toFixed(2)})`
    );
  }
};

/**
 * Apply a plan: reverse first (so re-posting sees the restored balance), then post, then
 * rewrite text. If any step throws, undo whatever already completed — newly posted legs are
 * reversed, reversed legs are posted again — so a failed edit leaves the books as it found
 * them, then rethrow the original error. If the undo itself fails, say so plainly instead of
 * pretending the voucher is intact.
 *
 * `previous` / `next` are each `{ post(line), reverse(line) }` bound to the voucher's OLD and
 * NEW header (date, account, wording) respectively. `post` fills in the ids of the records it
 * creates on the line it is given. `persist` writes the voucher document itself and runs last,
 * inside the same guard, so a failed save also rolls the ledgers back.
 */
const executeLineChanges = async ({ plan, previous, next, annotate, persist, voucherNumber }) => {
  const reversed = [];
  const posted = [];

  try {
    for (const line of [...plan.removed, ...plan.replaced.map((pair) => pair.existing)]) {
      await previous.reverse(line);
      reversed.push(line);
    }
    for (const { line } of [...plan.replaced, ...plan.added]) {
      await next.post(line);
      posted.push(line);
    }
    for (const { existing, line } of plan.annotated) {
      await annotate(existing, line);
    }
    await persist();
  } catch (error) {
    const undoFailures = [];
    for (const line of [...posted].reverse()) {
      try {
        await next.reverse(line);
      } catch (undoError) {
        undoFailures.push(undoError);
        logger.error(`Voucher ${voucherNumber}: could not undo a re-posted line after a failed edit: ${undoError.message}`);
      }
    }
    for (const line of reversed) {
      try {
        await previous.post(line);
      } catch (undoError) {
        undoFailures.push(undoError);
        logger.error(`Voucher ${voucherNumber}: could not restore a reversed line after a failed edit: ${undoError.message}`);
      }
    }
    if (undoFailures.length > 0) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        `Voucher ${voucherNumber} could not be updated and its earlier entries could not be fully restored. Check the bank account balance and Cash Book for this voucher before retrying.`
      );
    }
    throw error;
  }
};

module.exports = {
  sameText,
  sameId,
  sameAmount,
  sumAmounts,
  planLineChanges,
  assertLegsNotReconciled,
  assertSufficientFunds,
  executeLineChanges,
};
