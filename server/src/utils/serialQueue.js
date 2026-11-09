/**
 * Run async jobs one after another per key, inside this process.
 *
 * Ledger rows post their journal entries fire-and-forget. Two rows written back to back for
 * the same organization (a payment and the discount given with it) used to post at the same
 * time, and both could try to create the same chart-of-accounts row (first-time seeding, or a
 * customer's own receivable sub-account) — one lost with a duplicate-key error that the
 * caller swallowed, so that entry silently never reached the books. Queuing per org removes
 * the race without making the request wait.
 */
const tails = new Map();

const runSerial = (key, job) => {
  const k = String(key || 'global');
  const previous = tails.get(k) || Promise.resolve();
  const next = previous.catch(() => {}).then(job);
  const tail = next.catch(() => {});
  tails.set(k, tail);
  tail.then(() => {
    if (tails.get(k) === tail) tails.delete(k);
  });
  return next;
};

module.exports = { runSerial };
