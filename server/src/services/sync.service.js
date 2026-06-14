const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Product, Customer, Category, Supplier, SyncDevice, SyncRecord } = require('../models');
const ApiError = require('../utils/ApiError');
const { invoiceService, customerService, purchaseService, supplierService } = require('./index');
const {
  getClientVersion,
  detectUpdateConflict,
  handleUpdateConflict,
  listConflicts,
  resolveConflict,
} = require('./sync.conflict');

const BOOTSTRAP_LIMIT = 5000;
const PULL_LIMIT_PER_ENTITY = 2000;

const serializeDoc = (doc) => {
  if (!doc) return null;
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  return {
    ...json,
    salePrice: json.price ?? json.salePrice,
    version: json.syncVersion ?? doc.syncVersion ?? 1,
    lastUpdatedAt: doc.updatedAt || json.updatedAt,
    updatedBy: json.updatedBy ?? doc.updatedBy,
  };
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
  const [products, customers, categories, suppliers] = await Promise.all([
    Product.find(filter).sort({ updatedAt: -1 }).limit(BOOTSTRAP_LIMIT),
    Customer.find(filter).sort({ updatedAt: -1 }).limit(BOOTSTRAP_LIMIT),
    Category.find(filter).sort({ updatedAt: -1 }).limit(BOOTSTRAP_LIMIT),
    Supplier.find(filter).sort({ updatedAt: -1 }).limit(BOOTSTRAP_LIMIT),
  ]);

  const cursor = new Date().toISOString();

  return {
    organizationId: String(req.organizationId),
    branchId: String(req.branchId),
    products: products.map(serializeDoc),
    customers: customers.map(serializeDoc),
    categories: categories.map(serializeDoc),
    suppliers: suppliers.map(serializeDoc),
    cursors: {
      all: cursor,
      products: cursor,
      customers: cursor,
      categories: cursor,
      suppliers: cursor,
    },
    counts: {
      products: products.length,
      customers: customers.length,
      categories: categories.length,
      suppliers: suppliers.length,
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

  const [products, customers, categories, suppliers] = await Promise.all([
    Product.find(filter).sort({ updatedAt: 1 }).limit(PULL_LIMIT_PER_ENTITY),
    Customer.find(filter).sort({ updatedAt: 1 }).limit(PULL_LIMIT_PER_ENTITY),
    Category.find(filter).sort({ updatedAt: 1 }).limit(PULL_LIMIT_PER_ENTITY),
    Supplier.find(filter).sort({ updatedAt: 1 }).limit(PULL_LIMIT_PER_ENTITY),
  ]);

  const latest = [...products, ...customers, ...categories, ...suppliers]
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
    suppliers: suppliers.map(serializeDoc),
    cursor,
    counts: {
      products: products.length,
      customers: customers.length,
      categories: categories.length,
      suppliers: suppliers.length,
    },
  };
};

const processInvoiceCreate = async (payload, req) => {
  const invoiceBody = {
    ...payload,
    type: payload.type || 'cash',
    organizationId: req.organizationId,
    branchId: req.branchId,
  };

  delete invoiceBody.localInvoiceNumber;
  delete invoiceBody.offlineCreatedAt;
  delete invoiceBody.offlinePending;

  const invoice = await invoiceService.createInvoice(invoiceBody, req.user.id);
  return invoice.id || String(invoice._id);
};

const processPurchaseCreate = async (payload, req) => {
  const purchaseBody = {
    ...payload,
    organizationId: req.organizationId,
    branchId: req.branchId,
  };

  delete purchaseBody.localPurchaseNumber;
  delete purchaseBody.offlineCreatedAt;
  delete purchaseBody.offlinePending;

  const purchase = await purchaseService.createPurchase(purchaseBody);
  return purchase.id || String(purchase._id);
};

const processSupplierCreate = async (payload, req) => {
  const supplierBody = {
    ...payload,
    organizationId: req.organizationId,
    branchId: req.branchId,
    createdBy: req.user.id,
  };

  delete supplierBody.id;
  delete supplierBody._id;
  delete supplierBody.offlinePending;
  delete supplierBody.localSupplierNumber;
  delete supplierBody.offlineCreatedAt;

  const supplier = await supplierService.createSupplier(supplierBody);
  return supplier.id || String(supplier._id);
};

const processSupplierUpdate = async (payload, req) => {
  const supplierId = payload.supplierId || payload._id || payload.id;
  if (!supplierId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'supplierId is required for supplier update');
  }

  const updateBody = { ...payload };
  delete updateBody.supplierId;
  delete updateBody._id;
  delete updateBody.id;
  delete updateBody.organizationId;
  delete updateBody.branchId;
  delete updateBody.offlinePending;
  delete updateBody.offlineUpdatedAt;
  delete updateBody.baseVersion;
  delete updateBody.version;
  delete updateBody.syncVersion;
  delete updateBody.forceApply;

  if (!updateBody.updatedBy) {
    updateBody.updatedBy = req.user.id;
  }

  const supplier = await supplierService.updateSupplierById(supplierId, updateBody);
  return supplier.id || String(supplier._id);
};

const processCustomerCreate = async (payload, req) => {
  const customerBody = {
    ...payload,
    organizationId: req.organizationId,
    branchId: req.branchId,
    createdBy: req.user.id,
  };

  delete customerBody.id;
  delete customerBody._id;
  delete customerBody.offlinePending;
  delete customerBody.localCustomerNumber;
  delete customerBody.offlineCreatedAt;

  const customer = await customerService.createCustomer(customerBody);
  return customer.id || String(customer._id);
};

const processCustomerUpdate = async (payload, req) => {
  const customerId = payload.customerId || payload._id || payload.id;
  if (!customerId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'customerId is required for customer update');
  }

  const updateBody = { ...payload };
  delete updateBody.customerId;
  delete updateBody._id;
  delete updateBody.id;
  delete updateBody.organizationId;
  delete updateBody.branchId;
  delete updateBody.offlinePending;
  delete updateBody.offlineUpdatedAt;
  delete updateBody.baseVersion;
  delete updateBody.version;
  delete updateBody.syncVersion;
  delete updateBody.forceApply;

  if (!updateBody.updatedBy) {
    updateBody.updatedBy = req.user.id;
  }

  const customer = await customerService.updateCustomerById(customerId, updateBody);
  return customer.id || String(customer._id);
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
      const forceApply = payload?.forceApply === true;

      if (entity === 'invoice' && operation === 'create') {
        serverId = await processInvoiceCreate(payload, req);
      } else if (entity === 'purchase' && operation === 'create') {
        serverId = await processPurchaseCreate(payload, req);
      } else if (entity === 'customer' && operation === 'create') {
        serverId = await processCustomerCreate(payload, req);
      } else if (entity === 'customer' && operation === 'update') {
        const customerId = payload.customerId || payload._id || payload.id;
        if (!forceApply) {
          const conflict = await detectUpdateConflict({
            entityType: 'customer',
            entityId: customerId,
            clientVersion: getClientVersion(payload),
            req,
          });
          if (conflict) {
            const conflictResult = await handleUpdateConflict({
              clientId,
              deviceId,
              entityType: 'customer',
              entityId: customerId,
              operation,
              payload,
              conflict,
              req,
            });
            if (conflictResult.status === 'conflict_resolved') {
              await SyncRecord.create({
                clientId,
                deviceId,
                organizationId: req.organizationId,
                branchId: req.branchId,
                entity,
                operation,
                status: 'synced',
                serverId: new mongoose.Types.ObjectId(String(customerId)),
              });
              results.push({ clientId, status: 'synced', serverId: String(customerId), ...conflictResult });
              synced += 1;
            } else {
              results.push({ clientId, ...conflictResult });
            }
            continue;
          }
        }
        serverId = await processCustomerUpdate(payload, req);
      } else if (entity === 'supplier' && operation === 'create') {
        serverId = await processSupplierCreate(payload, req);
      } else if (entity === 'supplier' && operation === 'update') {
        const supplierId = payload.supplierId || payload._id || payload.id;
        if (!forceApply) {
          const conflict = await detectUpdateConflict({
            entityType: 'supplier',
            entityId: supplierId,
            clientVersion: getClientVersion(payload),
            req,
          });
          if (conflict) {
            const conflictResult = await handleUpdateConflict({
              clientId,
              deviceId,
              entityType: 'supplier',
              entityId: supplierId,
              operation,
              payload,
              conflict,
              req,
            });
            if (conflictResult.status === 'conflict_resolved') {
              await SyncRecord.create({
                clientId,
                deviceId,
                organizationId: req.organizationId,
                branchId: req.branchId,
                entity,
                operation,
                status: 'synced',
                serverId: new mongoose.Types.ObjectId(String(supplierId)),
              });
              results.push({ clientId, status: 'synced', serverId: String(supplierId), ...conflictResult });
              synced += 1;
            } else {
              results.push({ clientId, ...conflictResult });
            }
            continue;
          }
        }
        serverId = await processSupplierUpdate(payload, req);
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

const REPORT_PREFETCH_URLS = [
  '/reports/sales?startDate=2020-01-01&endDate=2030-12-31&groupBy=month',
  '/reports/sales/invoices?startDate=2020-01-01&endDate=2030-12-31',
  '/reports/purchases?startDate=2020-01-01&endDate=2030-12-31',
  '/reports/purchases/invoices?startDate=2020-01-01&endDate=2030-12-31',
  '/reports/products?startDate=2020-01-01&endDate=2030-12-31',
  '/reports/customers?startDate=2020-01-01&endDate=2030-12-31',
  '/reports/suppliers?startDate=2020-01-01&endDate=2030-12-31',
  '/reports/expenses?startDate=2020-01-01&endDate=2030-12-31',
  '/reports/profit-loss?startDate=2020-01-01&endDate=2030-12-31',
  '/reports/profit-loss-full?from=2020-01-01&to=2030-12-31',
  '/reports/inventory',
  '/reports/tax?startDate=2020-01-01&endDate=2030-12-31',
  '/reports/sales-returns?startDate=2020-01-01&endDate=2030-12-31',
  '/reports/purchase-returns?startDate=2020-01-01&endDate=2030-12-31',
  '/reports/load?startDate=2020-01-01&endDate=2030-12-31',
  '/reports/repair?startDate=2020-01-01&endDate=2030-12-31',
  '/reports/services?startDate=2020-01-01&endDate=2030-12-31',
  '/reports/roi?from=2020-01-01&to=2030-12-31',
  '/reports/roi/monthly?from=2020-01-01&to=2030-12-31',
  '/reports/sim-sales?startDate=2020-01-01&endDate=2030-12-31',
  '/reports/installments?startDate=2020-01-01&endDate=2030-12-31',
  '/reports/activity-summary?startDate=2020-01-01&endDate=2030-12-31',
  '/reports/sales-purchase-summary?startDate=2020-01-01&endDate=2030-12-31',
];

const BASE_PREFETCH_URLS = [
  '/products/all',
  '/categories?page=1&limit=5000',
  '/customers/all',
  '/suppliers?page=1&limit=5000',
  '/invoices?page=1&limit=200',
  '/purchases?page=1&limit=200',
  '/purchase-orders?page=1&limit=200',
  '/sales-returns?page=1&limit=200',
  '/purchase-returns?page=1&limit=200',
  '/dashboard/stats?period=today',
  '/dashboard/revenue?period=today',
  '/dashboard/top-products?period=today&limit=5',
  '/dashboard/top-customers?period=today&limit=5',
  '/dashboard/low-stock',
  '/dashboard/recent-activities?period=today&limit=10',
  '/payments/trial/status',
  '/branches/my',
  '/organizations/me',
  '/wallets?limit=100',
  '/roles',
  '/expense-categories?page=1&limit=500',
  '/accounts-system/chart-of-accounts',
  ...REPORT_PREFETCH_URLS,
];

const SCHOOL_PREFETCH_URLS = [
  '/school-classes?page=1&limit=500',
  '/sections?page=1&limit=500',
  '/subjects?page=1&limit=500',
  '/students?page=1&limit=5000',
  '/teachers?page=1&limit=500',
  '/school-attendance/sessions?page=1&limit=200',
  '/exams?page=1&limit=500',
  '/marks?page=1&limit=500',
  '/school-fees/structures?page=1&limit=500',
  '/fee-categories?page=1&limit=500',
  '/timetables?page=1&limit=200',
  '/school-dashboard/summary',
  '/visitors?page=1&limit=200',
  '/diaries?page=1&limit=200',
  '/notifications?page=1&limit=200',
  '/school-reports/summary',
];

const HR_PREFETCH_URLS = [
  '/employees?page=1&limit=500',
  '/departments?page=1&limit=500',
  '/attendance?page=1&limit=500',
  '/leaves?page=1&limit=500',
  '/payroll?page=1&limit=200',
];

const MOBILE_SHOP_PREFETCH_URLS = [
  '/load-purchases?page=1&limit=200',
  '/load-transactions?page=1&limit=200',
  '/sim-sales?page=1&limit=200',
  '/repairs?page=1&limit=200',
  '/services?page=1&limit=200',
  '/installments?page=1&limit=200',
  '/bill-payments?page=1&limit=200',
  '/cash-register/sessions?page=1&limit=100',
  '/mobile-dashboard/summary',
];

const RESTAURANT_PREFETCH_URLS = [
  '/restaurant/menu-items?page=1&limit=500',
  '/restaurant/tables?page=1&limit=200',
  '/restaurant/orders?page=1&limit=200',
  '/restaurant/dashboard/summary',
];

const OFFLINE_MANIFEST_VERSION = 1;

const COLLECTION_DEFINITIONS = {
  products: {
    label: 'Products',
    urls: ['/products/all', '/products?page=1&limit=5000'],
  },
  categories: {
    label: 'Categories',
    urls: ['/categories?page=1&limit=5000'],
  },
  customers: {
    label: 'Customers',
    urls: ['/customers/all', '/customers?page=1&limit=5000'],
  },
  suppliers: {
    label: 'Suppliers',
    urls: ['/suppliers?page=1&limit=5000'],
  },
  invoices: {
    label: 'Invoices',
    urls: ['/invoices?page=1&limit=500'],
  },
  purchases: {
    label: 'Purchases',
    urls: ['/purchases?page=1&limit=500'],
  },
  purchaseOrders: {
    label: 'Purchase orders',
    urls: ['/purchase-orders?page=1&limit=500'],
  },
  returns: {
    label: 'Returns',
    urls: ['/sales-returns?page=1&limit=200', '/purchase-returns?page=1&limit=200'],
  },
  dashboard: {
    label: 'Dashboard',
    urls: [
      '/dashboard/stats?period=today',
      '/dashboard/revenue?period=today',
      '/dashboard/top-products?period=today&limit=5',
      '/dashboard/top-customers?period=today&limit=5',
      '/dashboard/low-stock',
      '/dashboard/recent-activities?period=today&limit=10',
    ],
  },
  organization: {
    label: 'Organization',
    urls: ['/branches/my', '/organizations/me', '/roles', '/memberships?page=1&limit=500'],
  },
  accounting: {
    label: 'Accounting',
    urls: ['/expense-categories?page=1&limit=500', '/accounts-system/chart-of-accounts', '/wallets?limit=100'],
  },
  reports: {
    label: 'Reports',
    urls: REPORT_PREFETCH_URLS,
  },
  students: {
    label: 'Students',
    urls: ['/students?page=1&limit=5000'],
    businessTypes: ['school'],
  },
  teachers: {
    label: 'Teachers',
    urls: ['/teachers?page=1&limit=500'],
    businessTypes: ['school'],
  },
  schoolClasses: {
    label: 'Classes',
    urls: ['/school-classes?page=1&limit=500', '/sections?page=1&limit=500', '/subjects?page=1&limit=500'],
    businessTypes: ['school'],
  },
  schoolAttendance: {
    label: 'School attendance',
    urls: ['/school-attendance/sessions?page=1&limit=200'],
    businessTypes: ['school'],
  },
  exams: {
    label: 'Exams & marks',
    urls: ['/exams?page=1&limit=500', '/marks?page=1&limit=500'],
    businessTypes: ['school'],
  },
  fees: {
    label: 'Fees',
    urls: ['/school-fees/structures?page=1&limit=500', '/fee-categories?page=1&limit=500'],
    businessTypes: ['school'],
  },
  schoolOps: {
    label: 'School operations',
    urls: [
      '/timetables?page=1&limit=200',
      '/school-dashboard/summary',
      '/visitors?page=1&limit=200',
      '/diaries?page=1&limit=200',
      '/notifications?page=1&limit=200',
    ],
    businessTypes: ['school'],
  },
  employees: {
    label: 'Employees',
    urls: ['/employees?page=1&limit=500', '/departments?page=1&limit=500'],
    businessTypes: ['school', 'general'],
  },
  hr: {
    label: 'HR',
    urls: ['/attendance?page=1&limit=500', '/leaves?page=1&limit=500', '/payroll?page=1&limit=200'],
    businessTypes: ['school', 'general'],
  },
  mobileShop: {
    label: 'Mobile shop',
    urls: MOBILE_SHOP_PREFETCH_URLS,
    businessTypes: ['mobile_shop'],
  },
  restaurant: {
    label: 'Restaurant',
    urls: RESTAURANT_PREFETCH_URLS,
    businessTypes: ['restaurant'],
  },
};

function buildCollectionManifest(businessType) {
  const collections = {};

  for (const [key, definition] of Object.entries(COLLECTION_DEFINITIONS)) {
    const allowedTypes = definition.businessTypes;
    const enabled = !allowedTypes || allowedTypes.includes(businessType);
    collections[key] = {
      enabled,
      label: definition.label,
      urls: definition.urls,
    };
  }

  return collections;
}

const getPrefetchManifest = async (req) => {
  const { Organization } = require('../models');
  const org = await Organization.findById(req.organizationId).select('businessType').lean();
  const businessType = org?.businessType || 'general';

  const collections = buildCollectionManifest(businessType);
  const urls = [
    ...BASE_PREFETCH_URLS,
    ...(businessType === 'school' ? SCHOOL_PREFETCH_URLS : []),
    ...(businessType === 'school' || businessType === 'general' ? HR_PREFETCH_URLS : []),
    ...(businessType === 'mobile_shop' ? MOBILE_SHOP_PREFETCH_URLS : []),
    ...(businessType === 'restaurant' ? RESTAURANT_PREFETCH_URLS : []),
  ];

  return {
    version: OFFLINE_MANIFEST_VERSION,
    businessType,
    collections,
    urls: [...new Set(urls)],
  };
};

const pushHttpRequests = async ({ deviceId, requests = [] }, req) => {
  if (!req.branchId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Branch ID is required (x-branch-id header)');
  }
  if (!deviceId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'deviceId is required');
  }

  const app = require('../app');
  const request = require('supertest');

  const results = [];
  let synced = 0;
  let failed = 0;

  for (const item of requests) {
    const { clientId, method, path, body } = item;
    if (!clientId || !method || !path) {
      results.push({ clientId, status: 'failed', error: 'Invalid HTTP sync payload' });
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
        duplicate: true,
        error: existing.errorMessage,
      });
      if (existing.status === 'synced') synced += 1;
      else failed += 1;
      continue;
    }

    try {
      const normalizedPath = String(path).startsWith('/v1') ? String(path) : `/v1${path}`;
      const httpMethod = String(method).toLowerCase();
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(httpMethod)) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Unsupported HTTP method: ${method}`);
      }

      let chain = request(app)[httpMethod](normalizedPath);
      if (req.headers.authorization) chain = chain.set('Authorization', req.headers.authorization);
      if (req.branchId) chain = chain.set('x-branch-id', String(req.branchId));

      const res = await chain.send(body || {});

      if (res.status >= 400) {
        throw new ApiError(res.status, res.body?.message || `HTTP replay failed (${res.status})`);
      }

      await SyncRecord.create({
        clientId,
        deviceId,
        organizationId: req.organizationId,
        branchId: req.branchId,
        entity: 'http',
        operation: String(method).toLowerCase(),
        status: 'synced',
      });

      results.push({
        clientId,
        status: 'synced',
        statusCode: res.status,
        data: res.body,
      });
      synced += 1;
    } catch (err) {
      const message = err.message || 'HTTP sync failed';
      await SyncRecord.create({
        clientId,
        deviceId,
        organizationId: req.organizationId,
        branchId: req.branchId,
        entity: 'http',
        operation: String(method || 'post').toLowerCase(),
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
  pushHttpRequests,
  getPrefetchManifest,
  listConflicts,
  resolveConflict,
};
