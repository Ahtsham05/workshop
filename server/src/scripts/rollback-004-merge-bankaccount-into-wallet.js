/**
 * Rollback for Migration Script 004 (src/scripts/004-merge-bankaccount-into-wallet.js).
 *
 * Script 004 never creates BankAccount documents and never deletes/mutates existing ones,
 * so nothing there needs reverting. It only ever did two things to Wallet documents:
 *   1. Escalated `isDefault` from false to true.
 *   2. Filled in `accountHeadId` when it was previously unset.
 *   3. (Rarely, only when no matching Wallet existed at all) created a brand-new Wallet.
 *
 * Since (1) and (2) are indistinguishable from later organic edits made through the Bank
 * & Cash tab / Bank Accounts page after 004 ran, this only reverts a Wallet field when it
 * STILL EXACTLY matches what 004 would have written AND the source BankAccount still has
 * that same value — anything that looks like it changed since is left alone and logged
 * for manual review, never force-reverted. (3) is reverted by deleting the Wallet outright,
 * but ONLY if it still has zero balance and no dependent transactions — the same "never
 * destroy real data" guarantee.
 *
 * Usage:
 *   NODE_ENV=development node src/scripts/rollback-004-merge-bankaccount-into-wallet.js --org=<organizationId>            # dry-run
 *   NODE_ENV=development node src/scripts/rollback-004-merge-bankaccount-into-wallet.js --org=<organizationId> --apply    # write
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = require('../config/config');
const logger = require('../config/logger');
const { BankAccount, Wallet, LoadTransaction, CashWithdrawal, LoadPurchase, SimSale, WalletTransfer } = require('../models');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const orgArg = args.find((a) => a.startsWith('--org='));
const organizationId = orgArg ? orgArg.split('=')[1] : null;

async function hasDependentTransactions(wallet) {
  const counts = await Promise.all([
    LoadTransaction.countDocuments({ $or: [{ walletId: wallet._id }, { walletType: wallet.type }] }),
    CashWithdrawal.countDocuments({ $or: [{ walletId: wallet._id }, { walletType: wallet.type }] }),
    LoadPurchase.countDocuments({ walletType: wallet.type }),
    SimSale.countDocuments({ walletType: wallet.type }),
    WalletTransfer.countDocuments({ $or: [{ walletId: wallet._id }, { walletType: wallet.type }] }),
  ]);
  return counts.some((c) => c > 0);
}

async function run() {
  if (!organizationId) {
    logger.error('[rollback-004] --org=<organizationId> is required — rollback is always scoped to one org.');
    process.exit(1);
  }

  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('[rollback-004] Connected to MongoDB');
    logger.info(`[rollback-004] mode=${apply ? 'APPLY' : 'DRY-RUN'} org=${organizationId}`);

    const bankAccounts = await BankAccount.find({ organizationId }).lean();
    let reverted = 0;
    let skippedChangedSince = 0;

    for (const bank of bankAccounts) {
      if (!bank.branchId) continue;

      const wallet = await Wallet.findOne({
        organizationId: bank.organizationId,
        branchId: bank.branchId,
        type: { $regex: `^${bank.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      });
      if (!wallet) continue;

      const accountHeadStillMatches =
        bank.accountHeadId && wallet.accountHeadId && String(wallet.accountHeadId) === String(bank.accountHeadId);
      const defaultStillMatches = bank.isDefault === true && wallet.isDefault === true;

      if (!accountHeadStillMatches && !defaultStillMatches) continue;

      logger.info(
        `[rollback-004] REVERT Wallet ${wallet._id} ("${wallet.type}")` +
          `${defaultStillMatches ? ' isDefault→false' : ''}${accountHeadStillMatches ? ' accountHeadId→unset' : ''}`
      );
      reverted += 1;

      if (apply) {
        if (defaultStillMatches) wallet.isDefault = false;
        if (accountHeadStillMatches) wallet.accountHeadId = undefined;
        await wallet.save();
      }
    }

    // Wallets 004 created from scratch (no matching BankAccount existed at merge time) —
    // only safe to delete if untouched since: zero balance, no linked transactions.
    for (const bank of bankAccounts) {
      if (!bank.branchId) continue;
      const wallet = await Wallet.findOne({
        organizationId: bank.organizationId,
        branchId: bank.branchId,
        type: { $regex: `^${bank.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      });
      if (!wallet || (wallet.balance || 0) !== 0) continue;
      const dependent = await hasDependentTransactions(wallet);
      if (dependent) {
        skippedChangedSince += 1;
        logger.warn(`[rollback-004] SKIP deleting Wallet ${wallet._id} ("${wallet.type}") — has transaction history since 004 ran.`);
        continue;
      }
      // Only delete wallets that look freshly-created (no commission config either).
      if (wallet.commissionRate || wallet.withdrawalCommissionRate || wallet.depositCommissionRate) continue;
      logger.info(`[rollback-004] DELETE empty Wallet ${wallet._id} ("${wallet.type}") created by 004`);
      if (apply) await wallet.deleteOne();
    }

    logger.info(`[rollback-004] Summary: ${reverted} field(s) ${apply ? 'reverted' : 'would revert'}, ${skippedChangedSince} skipped (changed since)`);
    if (!apply) {
      logger.info('[rollback-004] Dry run only — re-run with --apply to write changes.');
    }

    await mongoose.disconnect();
    logger.info('[rollback-004] Done.');
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

run();
