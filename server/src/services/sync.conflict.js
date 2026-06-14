const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Customer, Supplier, Product, Category, SyncConflict } = require('../models');
const ApiError = require('../utils/ApiError');
const customerService = require('./customer.service');
const supplierService = require('./supplier.service');

const DEFAULT_STRATEGIES = {
  product: 'server_wins',
  category: 'server_wins',
  purchase: 'server_wins',
  invoice: 'manual_review',
  customer: 'manual_review',
  supplier: 'manual_review',
};

const ENTITY_MODELS = {
  customer: Customer,
  supplier: Supplier,
  product: Product,
  category: Category,
};

const serializeEntity = (doc) => {
  if (!doc) return null;
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  return {
    ...json,
    version: json.syncVersion ?? 1,
    lastUpdatedAt: json.updatedAt,
    updatedBy: json.updatedBy,
  };
};

const getDocVersion = (doc) => doc?.syncVersion ?? 1;

const getClientVersion = (payload) =>
  Number(payload?.baseVersion ?? payload?.version ?? payload?.syncVersion ?? 0);

async function loadEntity(entityType, entityId, req) {
  const Model = ENTITY_MODELS[entityType];
  if (!Model || !entityId) return null;
  return Model.findOne({
    _id: entityId,
    organizationId: req.organizationId,
    branchId: req.branchId,
  });
}

async function recordConflict({
  clientId,
  deviceId,
  entityType,
  entityId,
  operation,
  localData,
  serverDoc,
  localVersion,
  serverVersion,
  req,
}) {
  const defaultStrategy = DEFAULT_STRATEGIES[entityType] || 'manual_review';

  const conflict = await SyncConflict.findOneAndUpdate(
    {
      organizationId: req.organizationId,
      branchId: req.branchId,
      deviceId,
      clientId,
    },
    {
      entityType,
      entityId,
      operation,
      localData,
      serverData: serializeEntity(serverDoc),
      localVersion,
      serverVersion,
      defaultStrategy,
      status: 'open',
      resolution: undefined,
      resolvedAt: undefined,
      resolvedBy: undefined,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return conflict;
}

async function detectUpdateConflict({ entityType, entityId, clientVersion, req }) {
  const serverDoc = await loadEntity(entityType, entityId, req);
  if (!serverDoc) return null;

  const serverVersion = getDocVersion(serverDoc);
  if (!clientVersion || clientVersion >= serverVersion) {
    return null;
  }

  return {
    serverDoc,
    serverVersion,
    localVersion: clientVersion,
    strategy: DEFAULT_STRATEGIES[entityType] || 'manual_review',
  };
}

async function handleUpdateConflict({
  clientId,
  deviceId,
  entityType,
  entityId,
  operation,
  payload,
  conflict,
  req,
}) {
  if (conflict.strategy === 'server_wins') {
  return {
    status: 'conflict_resolved',
    resolution: 'server_wins',
    serverId: String(entityId),
    serverData: serializeEntity(conflict.serverDoc),
    message: 'Server version kept (inventory default)',
  };
  }

  const conflictDoc = await recordConflict({
    clientId,
    deviceId,
    entityType,
    entityId,
    operation,
    localData: payload,
    serverDoc: conflict.serverDoc,
    localVersion: conflict.localVersion,
    serverVersion: conflict.serverVersion,
    req,
  });

  return {
    status: 'conflict',
    conflictId: String(conflictDoc.id || conflictDoc._id),
    resolution: 'manual_review',
    defaultStrategy: conflict.strategy,
    serverVersion: conflict.serverVersion,
    localVersion: conflict.localVersion,
    serverData: serializeEntity(conflict.serverDoc),
    localData: payload,
    message: 'Sync conflict detected — review required',
  };
}

const listConflicts = async (req) => {
  const filter = {
    organizationId: req.organizationId,
    branchId: req.branchId,
    status: 'open',
  };
  if (req.query?.deviceId) {
    filter.deviceId = req.query.deviceId;
  }

  const conflicts = await SyncConflict.find(filter).sort({ createdAt: -1 }).limit(200);
  return conflicts.map((doc) => serializeEntity(doc));
};

const resolveConflict = async (conflictId, { strategy }, req) => {
  const conflict = await SyncConflict.findOne({
    _id: conflictId,
    organizationId: req.organizationId,
    branchId: req.branchId,
    status: 'open',
  });

  if (!conflict) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Conflict not found or already resolved');
  }

  const resolution = strategy || conflict.defaultStrategy || 'manual_review';

  if (resolution === 'server_wins') {
    conflict.status = 'resolved';
    conflict.resolution = 'server_wins';
    conflict.resolvedAt = new Date();
    conflict.resolvedBy = req.user.id;
    await conflict.save();

    return {
      conflictId: String(conflict.id || conflict._id),
      resolution: 'server_wins',
      entityType: conflict.entityType,
      entityId: String(conflict.entityId),
    };
  }

  if (resolution === 'local_wins') {
    const payload = {
      ...conflict.localData,
      forceApply: true,
    };

    if (conflict.entityType === 'customer') {
      payload.updatedBy = req.user.id;
      await customerService.updateCustomerById(String(conflict.entityId), payload);
    } else if (conflict.entityType === 'supplier') {
      payload.updatedBy = req.user.id;
      await supplierService.updateSupplierById(String(conflict.entityId), payload);
    } else {
      throw new ApiError(httpStatus.BAD_REQUEST, `Local wins not supported for ${conflict.entityType}`);
    }

    conflict.status = 'resolved';
    conflict.resolution = 'local_wins';
    conflict.resolvedAt = new Date();
    conflict.resolvedBy = req.user.id;
    await conflict.save();

    return {
      conflictId: String(conflict.id || conflict._id),
      resolution: 'local_wins',
      entityType: conflict.entityType,
      entityId: String(conflict.entityId),
    };
  }

  throw new ApiError(httpStatus.BAD_REQUEST, 'Manual review required — choose server_wins or local_wins');
};

module.exports = {
  DEFAULT_STRATEGIES,
  serializeEntity,
  getClientVersion,
  detectUpdateConflict,
  handleUpdateConflict,
  listConflicts,
  resolveConflict,
};
