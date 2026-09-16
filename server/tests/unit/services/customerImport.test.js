/**
 * Behaviour of the Excel/CSV customer import: what happens to a bad row, a row that's
 * already saved, a row repeated inside the same file, and an accounting step that fails
 * after the customer is already written.
 */

// `mock`-prefixed names are the ones jest.mock() factories are allowed to reach.
const mockInsertMany = jest.fn();
const mockBulkWrite = jest.fn();
const mockFind = jest.fn();
const mockSyncOpeningBalanceEntry = jest.fn();
const mockEnsureCustomerAccount = jest.fn();

jest.mock('../../../src/models', () => ({
  Customer: {
    find: (...args) => mockFind(...args),
    insertMany: (...args) => mockInsertMany(...args),
    bulkWrite: (...args) => mockBulkWrite(...args),
  },
}));
jest.mock('../../../src/services/customerLedger.service', () => ({
  syncOpeningBalanceEntry: (...args) => mockSyncOpeningBalanceEntry(...args),
}));
jest.mock('../../../src/services/accountsSystem.service', () => ({
  ensureCustomerAccount: (...args) => mockEnsureCustomerAccount(...args),
}));

const customerService = require('../../../src/services/customer.service');

const CONTEXT = { organizationId: 'org1', branchId: 'branch1', createdBy: 'user1' };

/** Mocks the "customers already saved in this branch" lookup. */
const mockExisting = (customers) => {
  mockFind.mockReturnValue({ select: () => ({ lean: async () => customers }) });
};

/** insertMany echoes back the documents it was given, as Mongo would. */
const echoInsert = () => {
  mockInsertMany.mockImplementation(async (docs) => docs.map((doc, i) => ({ ...doc, _id: `new${i}` })));
};

beforeEach(() => {
  jest.clearAllMocks();
  mockExisting([]);
  echoInsert();
  mockSyncOpeningBalanceEntry.mockResolvedValue(undefined);
  mockEnsureCustomerAccount.mockResolvedValue(undefined);
  mockBulkWrite.mockResolvedValue({ modifiedCount: 0, matchedCount: 0 });
});

describe('bulkAddCustomers', () => {
  test('imports the good rows and reports the bad one by row, instead of failing the batch', async () => {
    const result = await customerService.bulkAddCustomers(
      [
        { name: 'Ali Traders', phone: '03001234567', balance: '1,500' },
        { name: '', phone: '03009999999' },
        { name: 'Bilal Store', balance: 'not a number' },
        { name: 'Chenab Mart', phone: '03007654321' },
      ],
      CONTEXT,
    );

    expect(result.insertedCount).toBe(2);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toMatchObject({ index: 1, error: 'Customer name is empty' });
    expect(result.errors[1].index).toBe(2);
    expect(result.errors[1].error).toMatch(/not a number/);

    const inserted = mockInsertMany.mock.calls[0][0];
    expect(inserted.map((doc) => doc.name)).toEqual(['Ali Traders', 'Chenab Mart']);
    // "1,500" is fifteen hundred, not NaN and not 1.
    expect(inserted[0].balance).toBe(1500);
    // Imported customers carry the same branch/author stamp as ones added through the UI.
    expect(inserted[0]).toMatchObject({ organizationId: 'org1', branchId: 'branch1', createdBy: 'user1' });
  });

  test('keeps a row whose email is unusable, and says what it dropped', async () => {
    const result = await customerService.bulkAddCustomers([{ name: 'Ali', email: 'ali@nowhere' }], CONTEXT);

    expect(result.insertedCount).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings[0].message).toMatch(/doesn't look valid/);
    expect(mockInsertMany.mock.calls[0][0][0].email).toBe('');
  });

  test('skips a customer that is already saved rather than duplicating or erroring', async () => {
    mockExisting([{ _id: 'c1', name: 'Ali Traders', phone: '+92 300 1234567', email: '' }]);

    const result = await customerService.bulkAddCustomers(
      [
        { name: 'ALI TRADERS', phone: '0300-1234567' },
        { name: 'New Shop', phone: '03005555555' },
      ],
      CONTEXT,
    );

    expect(result.insertedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(result.skipped[0].reason).toMatch(/already saved/);
    expect(mockInsertMany.mock.calls[0][0].map((doc) => doc.name)).toEqual(['New Shop']);
  });

  test('updates an existing customer on request, without touching their balance', async () => {
    mockExisting([{ _id: 'c1', name: 'Ali Traders', phone: '03001234567', email: '' }]);
    mockBulkWrite.mockResolvedValue({ modifiedCount: 1, matchedCount: 1 });

    const result = await customerService.bulkAddCustomers(
      [{ name: 'Ali Traders', phone: '03001234567', address: 'New address', balance: 9999 }],
      CONTEXT,
      { duplicateStrategy: 'update' },
    );

    expect(result.updatedCount).toBe(1);
    expect(result.insertedCount).toBe(0);
    const [[ops]] = mockBulkWrite.mock.calls;
    expect(ops[0].updateOne.update.$set).toMatchObject({ address: 'New address' });
    expect(ops[0].updateOne.update.$set.balance).toBeUndefined();
  });

  test('reports an already-saved customer as an error only when asked to', async () => {
    mockExisting([{ _id: 'c1', name: 'Ali Traders', phone: '03001234567', email: '' }]);

    const result = await customerService.bulkAddCustomers([{ name: 'Ali Traders' }], CONTEXT, {
      duplicateStrategy: 'error',
    });

    expect(result.insertedCount).toBe(0);
    expect(result.errors[0].error).toMatch(/already saved/);
  });

  test('imports the same customer once when the file lists them twice', async () => {
    const result = await customerService.bulkAddCustomers(
      [
        { name: 'Ali Traders', phone: '03001234567' },
        { name: 'Ali Traders', phone: '+92 300 1234567' },
      ],
      CONTEXT,
    );

    expect(result.insertedCount).toBe(1);
    expect(result.skipped[0].reason).toMatch(/row 1 in this file/);
  });

  test('keeps the rows that were written when some of the batch fails', async () => {
    mockInsertMany.mockImplementation(async (docs) => {
      const error = new Error('duplicate key');
      error.writeErrors = [{ index: 1, err: { errmsg: 'E11000 duplicate key' } }];
      error.insertedDocs = [{ ...docs[0], _id: 'new0' }];
      throw error;
    });

    const result = await customerService.bulkAddCustomers(
      [{ name: 'Ali Traders' }, { name: 'Bilal Store' }],
      CONTEXT,
    );

    expect(result.insertedCount).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].name).toBe('Bilal Store');
  });

  test('still reports the import when the ledger account cannot be set up', async () => {
    mockEnsureCustomerAccount.mockRejectedValue(new Error('accounts unavailable'));

    const result = await customerService.bulkAddCustomers([{ name: 'Ali Traders' }], CONTEXT);

    expect(result.insertedCount).toBe(1);
    expect(result.warnings[0].message).toMatch(/could not be set up/);
  });

  test('gives every imported customer the opening balance entry and AR account a manual add gets', async () => {
    await customerService.bulkAddCustomers([{ name: 'Ali Traders', balance: 500 }], CONTEXT);

    expect(mockSyncOpeningBalanceEntry).toHaveBeenCalledWith(expect.objectContaining({ amount: 500 }));
    expect(mockEnsureCustomerAccount).toHaveBeenCalledTimes(1);
  });
});
