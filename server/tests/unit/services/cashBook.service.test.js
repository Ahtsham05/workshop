const mongoose = require('mongoose');
const { isDateOnlyValue, resolveEntryDate } = require('../../../src/services/cashBook.service');

/**
 * Cash Book line timing. Date-only pickers used to store every Cash Management / Load /
 * Bill payout line at 00:00 or 05:00, ahead of sales made hours earlier, so the running
 * balance never matched the drawer at any moment. Pure functions — no database needed.
 */
const idCreatedAt = (iso) => mongoose.Types.ObjectId.createFromTime(Math.floor(new Date(iso).getTime() / 1000));

// 2026-09-14 19:00 PKT
const NOW = new Date('2026-09-14T14:00:00.000Z');

describe('isDateOnlyValue', () => {
  test('business midnight (00:00 PKT) and UTC midnight (05:00 PKT) carry no time', () => {
    expect(isDateOnlyValue(new Date('2026-09-13T19:00:00.000Z'))).toBe(true);
    expect(isDateOnlyValue(new Date('2026-09-14T00:00:00.000Z'))).toBe(true);
  });

  test('a real time of day is kept as-is', () => {
    expect(isDateOnlyValue(new Date('2026-09-14T09:31:15.000Z'))).toBe(false);
    expect(isDateOnlyValue(new Date('2026-09-14T00:00:00.001Z'))).toBe(false);
    expect(isDateOnlyValue('not a date')).toBe(false);
  });
});

describe('resolveEntryDate', () => {
  test('leaves a date that already has a time untouched', () => {
    const timed = new Date('2026-09-14T09:31:15.000Z');
    expect(resolveEntryDate(timed, idCreatedAt('2026-09-10T08:00:00Z'), NOW).toISOString()).toBe(timed.toISOString());
  });

  test('date-only for the day the source was recorded → the moment it was recorded', () => {
    const ref = idCreatedAt('2026-09-14T09:30:00Z'); // 14:30 PKT
    expect(resolveEntryDate(new Date('2026-09-13T19:00:00.000Z'), ref, NOW).toISOString()).toBe('2026-09-14T09:30:00.000Z');
    expect(resolveEntryDate(new Date('2026-09-14T00:00:00.000Z'), ref, NOW).toISOString()).toBe('2026-09-14T09:30:00.000Z');
  });

  test('date-only today for an older source (bill collected earlier, paid today) → now', () => {
    const ref = idCreatedAt('2026-09-12T10:00:00Z');
    expect(resolveEntryDate(new Date('2026-09-14T00:00:00.000Z'), ref, NOW).toISOString()).toBe(NOW.toISOString());
  });

  test('back-dated date-only entry stays on its own day, at the time it was recorded', () => {
    const ref = idCreatedAt('2026-09-12T10:00:00Z'); // 15:00 PKT
    // 2026-09-10 picked → 2026-09-10 15:00 PKT
    expect(resolveEntryDate(new Date('2026-09-09T19:00:00.000Z'), ref, NOW).toISOString()).toBe('2026-09-10T10:00:00.000Z');
  });

  test('without a source reference, date-only today falls back to now', () => {
    expect(resolveEntryDate(new Date('2026-09-13T19:00:00.000Z'), undefined, NOW).toISOString()).toBe(NOW.toISOString());
    expect(resolveEntryDate(undefined, undefined, NOW).toISOString()).toBe(NOW.toISOString());
  });
});
