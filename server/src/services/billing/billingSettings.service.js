const { BillingSettings } = require('../../models');
const { DEFAULT_BILLING_SETTINGS } = require('../../config/billing');

const CACHE_TTL_MS = 30 * 1000;
let cache = { at: 0, value: null };

const invalidateSettingsCache = () => {
  cache = { at: 0, value: null };
};

/**
 * The BillingSettings singleton, created from DEFAULT_BILLING_SETTINGS the first time it is
 * read. Upsert with $setOnInsert so concurrent first reads cannot create two documents.
 */
const getSettings = async () => {
  if (cache.value && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  const value = await BillingSettings.findOneAndUpdate(
    { key: 'default' },
    { $setOnInsert: { key: 'default', ...DEFAULT_BILLING_SETTINGS } },
    { upsert: true, new: true, lean: true }
  );
  cache = { at: Date.now(), value };
  return value;
};

const EDITABLE = ['pkrPerUsd', 'graceDays', 'reminderDays', 'intentTtlHours', 'bank', 'jazzcash', 'easypaisa'];

const updateSettings = async (updates, adminUserId) => {
  const before = await getSettings();
  const $set = { updatedBy: adminUserId };
  EDITABLE.forEach((field) => {
    if (updates[field] === undefined) return;
    if (updates[field] && typeof updates[field] === 'object' && !Array.isArray(updates[field])) {
      Object.entries(updates[field]).forEach(([k, v]) => {
        $set[`${field}.${k}`] = v;
      });
    } else {
      $set[field] = updates[field];
    }
  });
  const after = await BillingSettings.findOneAndUpdate({ key: 'default' }, { $set }, { new: true, lean: true });
  invalidateSettingsCache();
  return { before, after };
};

/** Sequential, gap-free-under-normal-operation receipt number, e.g. "LXP-R-2026-000042". */
const nextReceiptNumber = async (now = new Date()) => {
  await getSettings();
  const doc = await BillingSettings.findOneAndUpdate(
    { key: 'default' },
    { $inc: { receiptSeq: 1 } },
    { new: true, projection: { receiptSeq: 1 }, lean: true }
  );
  return `LXP-R-${now.getUTCFullYear()}-${String(doc.receiptSeq).padStart(6, '0')}`;
};

/** What a customer sees on the payment-instructions screen — no internal fields. */
const publicPaymentDetails = (settings) => ({
  bank: settings.bank,
  jazzcash: settings.jazzcash,
  easypaisa: settings.easypaisa,
  pkrPerUsd: settings.pkrPerUsd,
});

module.exports = {
  getSettings,
  updateSettings,
  invalidateSettingsCache,
  nextReceiptNumber,
  publicPaymentDetails,
};
