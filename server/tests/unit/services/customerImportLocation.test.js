/**
 * City / State / Country columns on the customer import (wholesale & distributor orgs):
 * stored on billingAddress, country text resolved to an ISO code, empty cells never erase.
 */
const mockInsertMany = jest.fn();
const mockBulkWrite = jest.fn();
const mockFind = jest.fn();

jest.mock('../../../src/models', () => ({
  Customer: {
    find: (...args) => mockFind(...args),
    insertMany: (...args) => mockInsertMany(...args),
    bulkWrite: (...args) => mockBulkWrite(...args),
  },
}));
jest.mock('../../../src/services/customerLedger.service', () => ({ syncOpeningBalanceEntry: jest.fn() }));
jest.mock('../../../src/services/accountsSystem.service', () => ({ ensureCustomerAccount: jest.fn() }));

const customerService = require('../../../src/services/customer.service');
const { resolveCountryCode, mergeBillingAddress, countryName } = require('../../../src/utils/location');

const CONTEXT = { organizationId: 'org1', branchId: 'branch1', createdBy: 'user1' };

beforeEach(() => {
  jest.clearAllMocks();
  mockFind.mockReturnValue({ select: () => ({ lean: async () => [] }) });
  mockInsertMany.mockImplementation(async (docs) => docs.map((doc, i) => ({ ...doc, _id: `new${i}` })));
  mockBulkWrite.mockResolvedValue({ modifiedCount: 1, matchedCount: 1 });
});

describe('resolveCountryCode', () => {
  test.each([
    ['Pakistan', 'PK'],
    ['pk', 'PK'],
    ['USA', 'US'],
    ['United States', 'US'],
    ['U.K.', 'GB'],
    ['United Arab Emirates', 'AE'],
    ['  saudi arabia ', 'SA'],
  ])('%s → %s', (input, code) => {
    expect(resolveCountryCode(input)).toEqual({ code, invalid: false });
  });

  test('empty is not invalid, unknown is', () => {
    expect(resolveCountryCode('')).toEqual({ code: '', invalid: false });
    expect(resolveCountryCode('Narnia')).toEqual({ code: '', invalid: true });
  });

  test('countryName', () => {
    expect(countryName('pk')).toBe('Pakistan');
    expect(countryName('')).toBe('');
  });
});

describe('mergeBillingAddress', () => {
  test('keeps fields the patch does not mention and resolves the country', () => {
    expect(
      mergeBillingAddress(
        { line1: '12 Main St', postalCode: '77001', city: 'Old' },
        { city: ' Houston ', state: 'TX', countryCode: 'usa' }
      )
    ).toEqual({
      line1: '12 Main St',
      postalCode: '77001',
      city: 'Houston',
      state: 'TX',
      countryCode: 'US',
    });
  });
});

describe('bulkAddCustomers location columns', () => {
  test('new customers get a billingAddress; unknown country imports with a warning', async () => {
    const result = await customerService.bulkAddCustomers(
      [
        { name: 'Ali Traders', city: 'Lahore', state: 'Punjab', country: 'Pakistan' },
        { name: 'Gulf Foods', city: 'Dubai', country: 'Narnia' },
        { name: 'No Location' },
      ],
      CONTEXT
    );
    const docs = mockInsertMany.mock.calls[0][0];
    expect(docs[0].billingAddress).toEqual({ city: 'Lahore', state: 'Punjab', countryCode: 'PK' });
    expect(docs[1].billingAddress).toEqual({ city: 'Dubai' });
    expect(docs[2].billingAddress).toBeUndefined();
    expect(docs.some((d) => Object.keys(d).some((k) => k.startsWith('billingAddress.')))).toBe(false);
    expect(result.warnings).toEqual([expect.objectContaining({ index: 1, message: expect.stringContaining('Narnia') })]);
  });

  test('update merges only the filled cells into billingAddress', async () => {
    mockFind.mockReturnValue({
      select: () => ({ lean: async () => [{ _id: 'c1', name: 'Ali Traders', phone: '03001234567' }] }),
    });
    await customerService.bulkAddCustomers(
      [{ name: 'Ali Traders', phone: '03001234567', city: 'Multan', country: '' }],
      CONTEXT,
      {
        duplicateStrategy: 'update',
      }
    );
    const { $set } = mockBulkWrite.mock.calls[0][0][0].updateOne.update;
    expect($set['billingAddress.city']).toBe('Multan');
    expect($set).not.toHaveProperty(['billingAddress.countryCode']);
    expect($set).not.toHaveProperty(['billingAddress.state']);
    expect($set).not.toHaveProperty('billingAddress');
  });

  test("'location' strategy: saved customers get only City / State / Country, new ones are added", async () => {
    mockFind.mockReturnValue({
      select: () => ({
        lean: async () => [
          { _id: 'c1', name: 'Ali Traders', phone: '03001234567', creditLimit: 5000 },
          { _id: 'c2', name: 'Bilal Store' },
        ],
      }),
    });
    const result = await customerService.bulkAddCustomers(
      [
        {
          name: 'Ali Traders',
          phone: '03001234567',
          email: 'new@x.com',
          address: 'Changed',
          city: 'Lahore',
          state: 'Punjab',
          country: 'PK',
          creditLimit: '1',
        },
        { name: 'bilal store' },
        { name: 'Brand New', city: 'Karachi', country: 'Pakistan' },
      ],
      { organizationId: 'org1', branchId: 'branch1', createdBy: 'user1' },
      { duplicateStrategy: 'location' }
    );
    const ops = mockBulkWrite.mock.calls[0][0];
    expect(ops).toHaveLength(1);
    expect(ops[0].updateOne.filter).toEqual({ _id: 'c1', organizationId: 'org1', branchId: 'branch1' });
    expect(ops[0].updateOne.update).toEqual({
      $set: { 'billingAddress.city': 'Lahore', 'billingAddress.state': 'Punjab', 'billingAddress.countryCode': 'PK' },
    });
    expect(result.skipped).toEqual([expect.objectContaining({ index: 1, reason: expect.stringContaining('no City') })]);
    expect(mockInsertMany.mock.calls[0][0]).toHaveLength(1);
    expect(mockInsertMany.mock.calls[0][0][0]).toMatchObject({
      name: 'Brand New',
      billingAddress: { city: 'Karachi', countryCode: 'PK' },
    });
  });
});
