/**
 * Re-post the Cash Book lines of cash Received/Send entries saved before the commission
 * was folded into the cash line.
 *
 * Old format (Received ₹100 at 3%): "cash paid to customer" −100 and a separate
 * "commission from customer" +3 cash income — as if the customer handed the commission
 * over in cash. New format: one line, "cash paid to customer (100 less commission 3)" −97;
 * the profit stays in the wallet. A Send becomes one "cash received (900 + commission 27)".
 *
 * Only entries whose drawer total stays exactly the same are re-posted, at their original
 * time, so Cash in Hand / Track Cash never move. Entries that would change (e.g. ones saved
 * under the short-lived "customer pays the GST on top" model) are listed and left alone.
 *
 * Usage:
 *   node src/scripts/repost-cash-withdrawal-cashbook.js                 # dry run, all orgs
 *   node src/scripts/repost-cash-withdrawal-cashbook.js --org <orgId>   # dry run, one org
 *   node src/scripts/repost-cash-withdrawal-cashbook.js --apply [--org <orgId>]
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = require('../config/config');
const { CashBookEntry, CashWithdrawal } = require('../models');
const cashBookService = require('../services/cashBook.service');
const { drawerCashFor, customerLabelFor, postCashBookLines } = require('../services/cashWithdrawal.service');

const round = (n) => Math.round(Number(n || 0) * 100) / 100;
const signed = (line) => (line.type === 'income' ? 1 : -1) * Number(line.amount || 0);

const run = async () => {
  const apply = process.argv.includes('--apply');
  const orgIndex = process.argv.indexOf('--org');
  const orgId = orgIndex > -1 ? process.argv[orgIndex + 1] : null;

  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  console.log('Connected to MongoDB:', config.mongoose.url.replace(/\/\/.*@/, '//<creds>@'));
  console.log(apply ? 'MODE: APPLY' : 'MODE: DRY RUN (pass --apply to write)');

  const filter = orgId ? { organizationId: new mongoose.Types.ObjectId(orgId) } : {};
  const withdrawals = await CashWithdrawal.find(filter).sort({ date: 1 });
  console.log(`Loaded ${withdrawals.length} entries`);

  // Every Cash Book line of those entries in one query — one round trip each is slow on Atlas.
  const linesById = new Map();
  const allLines = await CashBookEntry.find({
    referenceModel: 'CashWithdrawal',
    ...(orgId ? { organizationId: filter.organizationId } : {}),
  }).lean();
  allLines.forEach((l) => {
    const key = String(l.referenceId);
    if (!linesById.has(key)) linesById.set(key, []);
    linesById.get(key).push(l);
  });

  let current = 0;
  let reposted = 0;
  const skipped = [];

  for (const w of withdrawals) {
    const lines = linesById.get(String(w._id)) || [];
    const cashLines = lines.filter((l) => l.paymentMethod === 'cash');
    const principalLines = cashLines.filter((l) => !/^GST /.test(l.description || ''));
    const net = drawerCashFor(w);

    const alreadyCurrent =
      lines.length > 0 &&
      principalLines.length === (net !== 0 ? 1 : 0) &&
      (net === 0 || round(signed(principalLines[0])) === net);
    if (alreadyCurrent) {
      current += 1;
      continue;
    }

    const oldCash = round(cashLines.reduce((sum, l) => sum + signed(l), 0));
    const newCash = round(net - Number(w.gstAmount || 0));
    if (oldCash !== newCash) {
      skipped.push({ id: String(w._id), date: w.date, type: w.transactionType, amount: w.amount, oldCash, newCash });
      continue;
    }

    if (apply) {
      const firstDate = lines.reduce((min, l) => (!min || l.date < min ? l.date : min), null);
      await cashBookService.deleteEntriesByReference(w._id, 'CashWithdrawal');
      await postCashBookLines(w, customerLabelFor(w), { date: firstDate || undefined });
    }
    reposted += 1;
  }

  console.log(`\nEntries checked:          ${withdrawals.length}`);
  console.log(`Already in the new format: ${current}`);
  console.log(`${apply ? 'Re-posted' : 'Would re-post'}:${apply ? '                ' : '            '}${reposted}`);
  console.log(`Left alone (cash total would change): ${skipped.length}`);
  skipped.forEach((s) =>
    console.log(`  ${s.id}  ${new Date(s.date).toISOString()}  ${s.type}  amount ${s.amount}  cash now ${s.oldCash} → would be ${s.newCash}`)
  );

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
