const tz = require('../../../src/utils/businessTimezone');

const inZone = (zone, fn) => tz.runWithBusinessTimeZone(zone, fn);

describe('businessTimezone — per-organization zone', () => {
  test('defaults to Asia/Karachi outside a request', () => {
    expect(tz.getBusinessTimeZone()).toBe('Asia/Karachi');
    expect(tz.startOfBusinessDay('2026-11-14').toISOString()).toBe('2026-11-13T19:00:00.000Z');
    expect(tz.endOfBusinessDay('2026-11-14').toISOString()).toBe('2026-11-14T18:59:59.999Z');
  });

  test('New York winter (EST, UTC−5) and summer (EDT, UTC−4)', () =>
    inZone('America/New_York', () => {
      expect(tz.startOfBusinessDay('2026-11-14').toISOString()).toBe('2026-11-14T05:00:00.000Z');
      expect(tz.startOfBusinessDay('2026-07-04').toISOString()).toBe('2026-07-04T04:00:00.000Z');
      // 9:43 PM EST on the 13th is already the 14th in UTC — still the 13th for the business.
      expect(tz.toBusinessCalendarDate(new Date('2026-11-14T02:43:02Z'))).toBe('2026-11-13');
    }));

  test('DST change days are 23 / 25 hours long (Los Angeles 2026)', () =>
    inZone('America/Los_Angeles', () => {
      const spring = tz.endOfBusinessDay('2026-03-08') - tz.startOfBusinessDay('2026-03-08') + 1;
      const fall = tz.endOfBusinessDay('2026-11-01') - tz.startOfBusinessDay('2026-11-01') + 1;
      expect(spring / 3600000).toBe(23);
      expect(fall / 3600000).toBe(25);
      expect(tz.eachBusinessCalendarDate(tz.startOfBusinessDay('2026-10-31'), tz.endOfBusinessDay('2026-11-02'))).toEqual([
        '2026-10-31',
        '2026-11-01',
        '2026-11-02',
      ]);
    }));

  test('datetime-local is business wall time (Chicago, Arizona has no DST)', () => {
    inZone('America/Chicago', () => {
      expect(tz.parseBusinessDateTime('2026-11-14T21:43:02').toISOString()).toBe('2026-11-15T03:43:02.000Z');
      expect(tz.parseBusinessDateTime('2026-06-14T21:43').toISOString()).toBe('2026-06-15T02:43:00.000Z');
    });
    inZone('America/Phoenix', () => {
      expect(tz.parseBusinessDateTime('2026-06-14T12:00').toISOString()).toBe('2026-06-14T19:00:00.000Z');
    });
  });

  test('atBusinessTimeOfDay keeps the wall-clock time across a DST change', () =>
    inZone('America/New_York', () => {
      const now = new Date('2026-11-14T14:30:00Z'); // 9:30 AM EST
      expect(tz.atBusinessTimeOfDay('2026-11-14', now)).toBe(now);
      // 9:30 AM EDT on 30 Oct = 13:30Z
      expect(tz.atBusinessTimeOfDay('2026-10-30', now).toISOString()).toBe('2026-10-30T13:30:00.000Z');
    }));

  test('UTC-midnight date-only values keep their calendar date west of UTC', () =>
    inZone('America/Denver', () => {
      expect(tz.toBusinessCalendarDate(new Date('2026-11-14'))).toBe('2026-11-14');
      expect(tz.parseBusinessDateBoundary(new Date('2026-11-14'), true).toISOString()).toBe('2026-11-15T06:59:59.999Z');
    }));

  test('isBusinessMidnight + zone validation', () => {
    inZone('America/New_York', () => {
      expect(tz.isBusinessMidnight(new Date('2026-11-14T05:00:00Z'))).toBe(true);
      expect(tz.isBusinessMidnight(new Date('2026-11-14T00:00:00Z'))).toBe(false);
    });
    expect(tz.isValidTimeZone('America/Anchorage')).toBe(true);
    expect(tz.isValidTimeZone('Mars/Base')).toBe(false);
    inZone('Mars/Base', () => expect(tz.getBusinessTimeZone()).toBe('Asia/Karachi'));
  });
});
