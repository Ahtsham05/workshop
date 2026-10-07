const { ManufacturingSettings } = require('../../models');
const { COUNTER_KEYS } = require('../../config/manufacturing');

/** Returns the org's manufacturing settings, creating the defaults on first use. */
const getSettings = async (organizationId) =>
  ManufacturingSettings.findOneAndUpdate(
    { organizationId },
    { $setOnInsert: { organizationId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

const UPDATABLE_FIELDS = [
  'numberPadding',
  'defaultSourceLocation',
  'defaultWipLocation',
  'defaultFinishedGoodsLocation',
  'allowNegativeStockIssue',
  'allowOverProduction',
  'requireBomForProduction',
  'explodeSubAssemblies',
  'defaultPriority',
  'requireQualityCheck',
  'defaultRejectDisposition',
];

const updateSettings = async (organizationId, body, updatedBy) => {
  await getSettings(organizationId);
  const $set = { updatedBy };
  UPDATABLE_FIELDS.forEach((field) => {
    if (body[field] !== undefined) $set[field] = body[field];
  });
  if (body.prefixes) {
    COUNTER_KEYS.forEach((key) => {
      if (body.prefixes[key] !== undefined) $set[`prefixes.${key}`] = String(body.prefixes[key]).trim().toUpperCase();
    });
  }
  return ManufacturingSettings.findOneAndUpdate({ organizationId }, { $set }, { new: true });
};

/**
 * Atomically reserves the next number for a manufacturing document type. Called outside
 * any transaction on purpose: a counter bump inside a multi-document transaction would
 * serialize every concurrent create on this one settings document. A rolled-back create
 * just leaves a gap in the sequence, which is harmless.
 */
const nextDocumentNumber = async (organizationId, key) => {
  await getSettings(organizationId);
  const settings = await ManufacturingSettings.findOneAndUpdate(
    { organizationId },
    { $inc: { [`counters.${key}`]: 1 } },
    { new: true }
  );
  const seq = settings.counters[key];
  const prefix = settings.prefixes[key] || key.toUpperCase();
  return `${prefix}-${String(seq).padStart(settings.numberPadding || 5, '0')}`;
};

module.exports = { getSettings, updateSettings, nextDocumentNumber };
