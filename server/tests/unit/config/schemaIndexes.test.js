const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const { Product } = require('../../../src/models');
const { ensureSchemaIndexes, indexFingerprint, runIndexMigrationOnce } = require('../../../src/config/schemaIndexes');

/**
 * Index building moved from "every new connection" (Mongoose autoIndex — ~450 commands on
 * every serverless cold start) to "once per version of the index definitions".
 */
setupTestDB();
jest.setTimeout(60000);

const meta = () => mongoose.connection.db.collection('schema_meta');

beforeEach(async () => {
  await meta().deleteMany({});
});

describe('ensureSchemaIndexes', () => {
  test('builds the indexes and records the fingerprint when none is stored', async () => {
    const spy = jest.spyOn(Product, 'createIndexes');

    const result = await ensureSchemaIndexes();

    expect(result.built).toBe(true);
    expect(result.recorded).toBe(true);
    expect(spy).toHaveBeenCalled();
    expect(await meta().findOne({ _id: 'model-indexes' })).toMatchObject({ fingerprint: indexFingerprint() });
    const names = (await mongoose.connection.collection('products').indexes()).map((idx) => idx.name);
    expect(names).toContain('organizationId_1_branchId_1_barcode_1');
    spy.mockRestore();
  });

  test('a definition the server always refuses is recorded too, so cold starts do not retry it forever', async () => {
    // A few existing schemas declare indexes MongoDB rejects (e.g. an unsupported partial
    // filter); autoIndex failed on those silently on every connection.
    const { failures } = await ensureSchemaIndexes();

    expect(await meta().findOne({ _id: 'model-indexes' })).toMatchObject({ rejectedModels: failures });
    const createIndexes = jest.spyOn(Product, 'createIndexes');
    expect(await ensureSchemaIndexes()).toEqual({ built: false });
    expect(createIndexes).not.toHaveBeenCalled();
    createIndexes.mockRestore();
  });

  test('not reaching the server leaves the build unrecorded, so the next instance retries', async () => {
    const networkError = Object.assign(new Error('connection reset'), { name: 'MongoNetworkError' });
    const createIndexes = jest.spyOn(Product, 'createIndexes').mockRejectedValue(networkError);

    const result = await ensureSchemaIndexes();

    expect(result).toMatchObject({ built: true, recorded: false });
    expect(await meta().findOne({ _id: 'model-indexes' })).toBeNull();
    createIndexes.mockRestore();
  });
});

describe('runIndexMigrationOnce', () => {
  test('runs the migration once, then only reads the marker', async () => {
    const migrate = jest.fn().mockResolvedValue(true);

    expect(await runIndexMigrationOnce(Product, 'test-migration', migrate)).toBe(true);
    expect(await runIndexMigrationOnce(Product, 'test-migration', migrate)).toBe(true);

    expect(migrate).toHaveBeenCalledTimes(1);
  });

  test('a failed migration is not recorded, so the next call retries it', async () => {
    const migrate = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    expect(await runIndexMigrationOnce(Product, 'test-migration', migrate)).toBe(false);
    expect(await runIndexMigrationOnce(Product, 'test-migration', migrate)).toBe(true);

    expect(migrate).toHaveBeenCalledTimes(2);
  });

  test('runs again when the index definitions change', async () => {
    await meta().insertOne({ _id: 'test-migration', fingerprint: 'an older version' });
    const migrate = jest.fn().mockResolvedValue(true);

    await runIndexMigrationOnce(Product, 'test-migration', migrate);

    expect(migrate).toHaveBeenCalledTimes(1);
  });
});
