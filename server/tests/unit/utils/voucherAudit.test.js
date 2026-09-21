const { voucherAuditSnapshot, voucherCreateAuditFields } = require('../../../src/utils/voucherAudit');
const { diffFields } = require('../../../src/services/auditLog.service');

/**
 * What a voucher looks like in the audit trail. The Activity tab renders these values as-is, so the
 * contract that matters is "readable primitives only": no raw bank-account id, no nested line
 * objects (which any screen that doesn't special-case them prints as "[object Object]").
 */
const payment = (over = {}) => ({
  date: new Date('2026-08-10T00:00:00.000Z'),
  bankAccountId: '6a78df453f5ff7da36e21358',
  bankAccountName: 'Cash in Hand',
  totalAmount: 3000,
  lines: [
    { payeeType: 'expense', payeeName: 'Rent', amount: 1000, description: 'September', _id: 'x1' },
    { payeeType: 'supplier', payeeName: 'ACME Traders', amount: 2000, _id: 'x2' },
  ],
  ...over,
});

describe('voucherAuditSnapshot', () => {
  test('flattens a payment voucher to readable values, naming the account instead of its id', () => {
    const snapshot = voucherAuditSnapshot(payment(), 'payeeName');

    expect(snapshot.bankAccountName).toBe('Cash in Hand');
    expect(snapshot).not.toHaveProperty('bankAccountId');
    expect(snapshot.lines).toBe('Rent: 1000 (September); ACME Traders: 2000');
    expect(snapshot.totalAmount).toBe(3000);
  });

  test('uses the payer name on a receipt voucher', () => {
    const snapshot = voucherAuditSnapshot(
      payment({ lines: [{ sourceType: 'customer', payerName: 'Bilal Store', amount: 700 }] }),
      'payerName'
    );
    expect(snapshot.lines).toBe('Bilal Store: 700');
  });

  test('every value is a primitive (or a Date) — never an object or array', () => {
    Object.values(voucherAuditSnapshot(payment({ reference: 'CHQ-1', notes: 'n' }), 'payeeName')).forEach((value) => {
      expect(value instanceof Date || typeof value !== 'object').toBe(true);
    });
  });
});

describe('what a creation records', () => {
  test('is the date, account name, total and lines — and not the blank reference/notes', () => {
    const voucher = payment();
    const changes = diffFields({}, voucherAuditSnapshot(voucher, 'payeeName'), voucherCreateAuditFields(voucher));

    expect(changes.map((change) => change.field)).toEqual(['date', 'bankAccountName', 'totalAmount', 'lines']);
    expect(changes.find((change) => change.field === 'bankAccountName').newValue).toBe('Cash in Hand');
    expect(changes.find((change) => change.field === 'lines').newValue).toBe('Rent: 1000 (September); ACME Traders: 2000');
    expect(JSON.stringify(changes)).not.toMatch(/6a78df453f5ff7da36e21358/);
  });

  test('includes reference and notes once they are filled in', () => {
    const voucher = payment({ reference: 'CHQ-77', notes: 'Approved' });
    const fields = diffFields({}, voucherAuditSnapshot(voucher, 'payeeName'), voucherCreateAuditFields(voucher)).map(
      (change) => change.field
    );
    expect(fields).toEqual(['date', 'bankAccountName', 'totalAmount', 'lines', 'reference', 'notes']);
  });
});

describe('what an edit records', () => {
  test('only the fields that actually changed', () => {
    const before = payment();
    const after = payment({
      totalAmount: 3500,
      lines: [
        { payeeType: 'expense', payeeName: 'Rent', amount: 1500, description: 'September', _id: 'x1' },
        { payeeType: 'supplier', payeeName: 'ACME Traders', amount: 2000, _id: 'x2' },
      ],
    });

    const changes = diffFields(voucherAuditSnapshot(before, 'payeeName'), voucherAuditSnapshot(after, 'payeeName'));

    expect(changes.map((change) => change.field).sort()).toEqual(['lines', 'totalAmount']);
    expect(changes.find((change) => change.field === 'totalAmount')).toMatchObject({ oldValue: 3000, newValue: 3500 });
  });

  test('a voucher whose reference/notes were never set does not show them as changed', () => {
    const changes = diffFields(
      voucherAuditSnapshot(payment({ reference: undefined, notes: undefined }), 'payeeName'),
      voucherAuditSnapshot(payment({ reference: '', notes: '' }), 'payeeName')
    );
    expect(changes).toEqual([]);
  });
});
