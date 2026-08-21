/**
 * Migration Script 004: merge BankAccount docs (Accounts System "Bank & Cash" tab) into
 * the matching Wallet doc (Mobile Shop "Bank Accounts" page) — see the "Unify Bank/Cash
 * Accounts" plan. Going forward both pages read/write Wallet only; this is a one-time,
 * additive backfill for data that predates the change.
 *
 * For each BankAccount, find the Wallet in the same org/branch whose `type` matches the
 * BankAccount's `name` (case-insensitive — mirrors the existing "Cash in Hand" match in
 * wallet.service.js#ensureDefaultCashWallet):
 *   - If found: only ESCALATE `isDefault` (false → true, never the reverse) and only fill
 *     `accountHeadId` when the wallet doesn't already have one. Never touches balance,
 *     commission rates, or any other wallet field.
 *   - If not found: creates a new Wallet from the BankAccount's fields (skipped, with a
 *     warning, when the BankAccount has no branchId — Wallet.branchId is required and
 *     there's no safe branch to assign it to).
 *
 * Never modifies or deletes the source BankAccount documents — this script can be re-run
 * safely (idempotent: a second run finds nothing left to change).
 *
 * Usage:
 *   NODE_ENV=development node src/scripts/004-merge-bankaccount-into-wallet.js                       # dry-run, all orgs
 *   NODE_ENV=development node src/scripts/004-merge-bankaccount-into-wallet.js --org=<organizationId> # dry-run, one org
 *   NODE_ENV=development node src/scripts/004-merge-bankaccount-into-wallet.js --apply                # write, all orgs
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = require('../config/config');
const logger = require('../config/logger');
const { BankAccount, Wallet } = require('../models');
const walletService = require('../services/wallet.service');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const orgArg = args.find((a) => a.startsWith('--org='));
const organizationId = orgArg ? orgArg.split('=')[1] : null;

async function run() {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('[004-merge-bankaccount] Connected to MongoDB');
    logger.info(`[004-merge-bankaccount] mode=${apply ? 'APPLY' : 'DRY-RUN'} org=${organizationId || 'ALL'}`);

    const filter = organizationId ? { organizationId } : {};
    const bankAccounts = await BankAccount.find(filter).lean();
    logger.info(`[004-merge-bankaccount] ${bankAccounts.length} BankAccount document(s) to process`);

    let matchedUnchanged = 0;
    let matchedUpdated = 0;
    let created = 0;
    let skippedNoBranch = 0;

    for (const bank of bankAccounts) {
      if (!bank.branchId) {
        skippedNoBranch += 1;
        logger.warn(
          `[004-merge-bankaccount] SKIP "${bank.name}" (org ${bank.organizationId}) — no branchId, ` +
            'cannot map to a Wallet (branchId is required). Needs manual review.'
        );
        continue;
      }

      const wallet = await Wallet.findOne({
        organizationId: bank.organizationId,
        branchId: bank.branchId,
        type: { $regex: `^${bank.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      });

      if (wallet) {
        const willEscalateDefault = bank.isDefault === true && wallet.isDefault !== true;
        const willFillAccountHead = !wallet.accountHeadId && !!bank.accountHeadId;

        if (!willEscalateDefault && !willFillAccountHead) {
          matchedUnchanged += 1;
          continue;
        }

        logger.info(
          `[004-merge-bankaccount] MATCH "${bank.name}" → Wallet ${wallet._id}` +
            `${willEscalateDefault ? ' (set isDefault=true)' : ''}${willFillAccountHead ? ' (link accountHeadId)' : ''}`
        );
        matchedUpdated += 1;

        if (apply) {
          if (willEscalateDefault) wallet.isDefault = true;
          if (willFillAccountHead) wallet.accountHeadId = bank.accountHeadId;
          await wallet.save();
        }
      } else {
        logger.info(`[004-merge-bankaccount] CREATE Wallet for BankAccount "${bank.name}" (org ${bank.organizationId})`);
        created += 1;

        if (apply) {
          await walletService.createOrUpdateWallet({
            organizationId: bank.organizationId,
            branchId: bank.branchId,
            type: bank.name,
            balance: bank.currentBalance || bank.openingBalance || 0,
            accountType: bank.accountType,
            bankName: bank.bankName,
            accountNumber: bank.accountNumber,
            branchName: bank.branchName,
            isDefault: bank.isDefault,
            accountHeadId: bank.accountHeadId,
            userId: bank.createdBy,
          });
        }
      }
    }

    logger.info(
      `[004-merge-bankaccount] Summary: ${matchedUnchanged} already in sync, ${matchedUpdated} ${apply ? 'updated' : 'would update'}, ` +
        `${created} ${apply ? 'created' : 'would create'}, ${skippedNoBranch} skipped (no branchId)`
    );
    if (!apply) {
      logger.info('[004-merge-bankaccount] Dry run only — re-run with --apply to write changes.');
    }

    await mongoose.disconnect();
    logger.info('[004-merge-bankaccount] Done.');
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

run();
