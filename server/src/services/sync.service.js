const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Product, Customer, Category, SyncDevice, SyncRecord } = require('../models');
const ApiError = require('../utils/ApiError');
const { invoiceService } = require('./index');

const BOOTSTRAP_LIMIT = 5000;
const PULL_LIMIT_PER_ENTITY = 2000;

const serializeDoc = (doc) => {
  if (!doc) return null;
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  return { ...json, salePrice: json.price ?? json.salePrice };
};

const parseSince = (since) => {
  if (!since) return null;
  const date = new Date(since);
  return Number.isNaN(date.getTime()) ? null : date;
};

const registerDevice = async ({ deviceId, deviceName, platform }, req) => {
  if (!req.branchId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Branch ID is required (x-branch-id header)');
  }

  const device = await SyncDevice.findOneAndUpdate(
    {
      deviceId,
      organizationId: req.organizationId,
      branchId: req.branchId,
    },
    {
      userId: req.user.id,
      deviceName: deviceName || 'Desktop POS',
      platform: platform || 'unknown',
      lastSeenAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return device;
};

const fetchBootstrapData = async (req) => {
  if (!req.branchId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Branch ID is required (x-branch-id header)');
  }

  const filter = { organizationId: req.organizationId, branchId: req.branchId };
  const [products, customers, categories] = await Promise.all([
    Product.find(filter).sort({ updatedAt: -1 }).limit(BOOTSTRAP_LIMIT),
    Customer.find(filter).sort({ updatedAt: -1 }).limit(BOOTSTRAP_LIMIT),
    Category.find(filter).sort({ updatedAt: -1 }).limit(BOOTSTRAP_LIMIT),
  ]);

  const cursor = new Date().toISOString();

  return {
    organizationId: String(req.organizationId),
    branchId: String(req.branchId),
    products: products.map(serializeDoc),
    customers: customers.map(serializeDoc),
    categories: categories.map(serializeDoc),
    cursors: {
      all: cursor,
      products: cursor,
      customers: cursor,
      categories: cursor,
    },
    counts: {
      products: products.length,
      customers: customers.length,
      categories: categories.length,
    },
  };
};

const pullDelta = async (since, req) => {
  if (!req.branchId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Branch ID is required (x-branch-id header)');
  }

  const sinceDate = parseSince(since);
  const filter = { organizationId: req.organizationId, branchId: req.branchId };
  if (sinceDate) {
    filter.updatedAt = { $gt: sinceDate };
  }

  const [products, customers, categories] = await Promise.all([
    Product.find(filter).sort({ updatedAt: 1 }).limit(PULL_LIMIT_PER_ENTITY),
    Customer.find(filter).sort({ updatedAt: 1 }).limit(PULL_LIMIT_PER_ENTITY),
    Category.find(filter).sort({ updatedAt: 1 }).limit(PULL_LIMIT_PER_ENTITY),
  ]);

  const latest = [...products, ...customers, ...categories]
    .map((d) => d.updatedAt)
    .filter(Boolean)
    .sort((a, b) => b - a)[0];

  const cursor = (latest || new Date()).toISOString();

  return {
    organizationId: String(req.organizationId),
    branchId: String(req.branchId),
    products: products.map(serializeDoc),
    customers: customers.map(serializeDoc),
    categories: categories.map(serializeDoc),
    cursor,
    counts: {
      products: products.length,
      customers: customers.length,
      categories: categories.length,
    },
  };
};

const processInvoiceCreate = async (payload, req) => {
  if (payload.type && payload.type !== 'cash') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Offline sync currently supports cash invoices only');
  }

  const invoiceBody = {
    ...payload,
    type: payload.type || 'cash',
    organizationId: req.organizationId,
    branchId: req.branchId,
  };

  const invoice = await invoiceService.createInvoice(invoiceBody, req.user.id);
  return invoice.id || String(invoice._id);
};

const pushOperations = async ({ deviceId, operations = [] }, req) => {
  if (!req.branchId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Branch ID is required (x-branch-id header)');
  }
  if (!deviceId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'deviceId is required');
  }

  const results = [];
  let synced = 0;
  let failed = 0;

  for (const op of operations) {
    const { clientId, entity, operation, payload } = op;
    if (!clientId || !entity || !operation) {
      results.push({ clientId, status: 'failed', error: 'Invalid operation payload' });
      failed += 1;
      continue;
    }

    const existing = await SyncRecord.findOne({
      organizationId: req.organizationId,
      branchId: req.branchId,
      deviceId,
      clientId,
    });

    if (existing) {
      results.push({
        clientId,
        status: existing.status,
        serverId: existing.serverId ? String(existing.serverId) : undefined,
        error: existing.errorMessage,
        duplicate: true,
      });
      if (existing.status === 'synced') synced += 1;
      else failed += 1;
      continue;
    }

    try {
      let serverId;
      if (entity === 'invoice' && operation === 'create') {
        serverId = await processInvoiceCreate(payload, req);
      } else {
        throw new ApiError(httpStatus.BAD_REQUEST, `Unsupported sync operation: ${entity}.${operation}`);
      }

      await SyncRecord.create({
        clientId,
        deviceId,
        organizationId: req.organizationId,
        branchId: req.branchId,
        entity,
        operation,
        status: 'synced',
        serverId: serverId ? new mongoose.Types.ObjectId(serverId) : undefined,
      });

      results.push({ clientId, status: 'synced', serverId });
      synced += 1;
    } catch (err) {
      const message = err.message || 'Sync failed';
      await SyncRecord.create({
        clientId,
        deviceId,
        organizationId: req.organizationId,
        branchId: req.branchId,
        entity,
        operation,
        status: 'failed',
        errorMessage: message,
      });
      results.push({ clientId, status: 'failed', error: message });
      failed += 1;
    }
  }

  await SyncDevice.findOneAndUpdate(
    { deviceId, organizationId: req.organizationId, branchId: req.branchId },
    { lastPushAt: new Date(), lastSeenAt: new Date() },
    { upsert: true },
  );

  return { synced, failed, results };
};

module.exports = {
  registerDevice,
  fetchBootstrapData,
  pullDelta,
  pushOperations,
};
