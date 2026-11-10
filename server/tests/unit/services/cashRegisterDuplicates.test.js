const mongoose = require('mongoose');
const { findPossibleDuplicates } = require('../../../src/services/cashRegister.service');

const at = (time) => new Date(`2026-11-10T${time}Z`);
const line = (time, amount, description, extra = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  referenceId: new mongoose.Types.ObjectId(),
  referenceModel: 'CashWithdrawal',
  source: 'other',
  type: 'income',
  amount,
  description,
  createdAt: at(time),
  date: at(time),
  ...extra,
});

describe('cash count: possible double entries', () => {
  test('flags the same bulk batch saved again a few seconds later', () => {
    const entries = [
      line('06:13:51.340', 505, 'Deposit: cash received from customer (500 + commission 5)'),
      line('06:13:51.373', 4040, 'Deposit: cash received from customer (4,000 + commission 40)'),
      line('06:14:02.171', 505, 'Deposit: cash received from customer (500 + commission 5)'),
      line('06:14:02.205', 4040, 'Deposit: cash received from customer (4,000 + commission 40)'),
    ];
    const flagged = findPossibleDuplicates(entries);
    expect(flagged.map((d) => d.amount)).toEqual([505, 4040]);
    expect(flagged[0].repeatOf.id).toBe(String(entries[0]._id));
  });

  test('ignores identical rows typed into one save, repeats far apart, and other amounts', () => {
    const entries = [
      line('06:13:10.351', 1960, 'Withdrawal: cash paid to customer (2,000 less commission 40)', { type: 'expense' }),
      line('06:13:10.510', 1960, 'Withdrawal: cash paid to customer (2,000 less commission 40)', { type: 'expense' }),
      line('06:20:00.000', 1960, 'Withdrawal: cash paid to customer (2,000 less commission 40)', { type: 'expense' }),
      line('06:20:05.000', 980, 'Withdrawal: cash paid to customer (1,000 less commission 20)', { type: 'expense' }),
    ];
    expect(findPossibleDuplicates(entries)).toEqual([]);
  });

  test('does not flag two cash lines of the same record', () => {
    const shared = new mongoose.Types.ObjectId();
    const entries = [
      line('06:00:00.000', 100, 'Same', { referenceId: shared }),
      line('06:00:30.000', 100, 'Same', { referenceId: shared }),
    ];
    expect(findPossibleDuplicates(entries)).toEqual([]);
  });
});
