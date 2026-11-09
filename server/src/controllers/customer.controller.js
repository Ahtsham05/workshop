const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { customerService } = require('../services');
const pick = require('../utils/pick');
const { Sale, Transaction } = require('../models');
const { applyBranchFilter, getBranchContext, resolveWriteBranchId } = require('../utils/branchFilter');
const ApiError = require('../utils/ApiError');
const { uploadToCloudinary } = require('../middlewares/upload');
const customerVisionService = require('../services/customerVision.service');
const creditControlService = require('../services/creditControl.service');
const { userHasAnyPermission } = require('../middlewares/permission');

/**
 * Credit limit on the customer form: only manageCreditLimits may set or change it (it is
 * what stops credit sales), every change lands in the customer's credit history, and a new
 * customer without one gets the org's default limit.
 */
const resolveFormCreditLimit = async (req, existing) => {
  const body = req.body;
  const provided = Object.prototype.hasOwnProperty.call(body, 'creditLimit') && body.creditLimit !== null && body.creditLimit !== '';
  const canManage = await userHasAnyPermission(req.user, ['manageCreditLimits']);
  if (!existing) {
    if (!provided || !canManage) {
      const settings = await creditControlService.getSettings(req.organizationId);
      body.creditLimit = settings.defaultCreditLimit;
    }
    return;
  }
  if (!provided) {
    delete body.creditLimit;
    return;
  }
  if (Number(body.creditLimit) === Number(existing.creditLimit || 0)) return;
  if (!canManage) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to change credit limits.');
  }
};

const createCustomer = catchAsync(async (req, res) => {
  await resolveWriteBranchId(req);
  await resolveFormCreditLimit(req, null);
  const customer = await customerService.createCustomer({ ...req.body, ...getBranchContext(req) });
  if (customer.creditLimit > 0) {
    creditControlService.recordFormLimitChange(customer, 0, { id: req.user.id, name: req.user.name });
  }
  res.status(httpStatus.CREATED).send(customer);
});

const getCustomers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'email', 'phone', 'isActive']);
  applyBranchFilter(filter, req);
  if (req.query.includeEmployees !== 'true' && req.query.includeEmployees !== true) {
    filter.isEmployeeAccount = { $ne: true };
  }
  if (req.query.includeSuppliers !== 'true' && req.query.includeSuppliers !== true) {
    filter.isSupplierAccount = { $ne: true };
  }
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'fieldName']);
  const result = await customerService.queryCustomers(filter, options);
  // Credit used / available per row (one pending-invoice query for the page).
  if (req.organizationId && Array.isArray(result?.results) && result.results.length) {
    const summaries = await creditControlService.summarizeCustomers(req.organizationId, result.results);
    const payload = typeof result.toJSON === 'function' ? result.toJSON() : { ...result };
    payload.results = result.results.map((customer, i) => ({
      ...(typeof customer.toJSON === 'function' ? customer.toJSON() : customer),
      credit: summaries[i],
    }));
    res.send(payload);
    return;
  }
  res.send(result);
});

const getCustomer = catchAsync(async (req, res) => {
  const customer = await customerService.getCustomerById(req.params.customerId);
  if (!customer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
  }
  res.send(customer);
});

const updateCustomer = catchAsync(async (req, res) => {
  const existing = await customerService.getCustomerById(req.params.customerId);
  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
  }
  const previousLimit = Number(existing.creditLimit || 0);
  await resolveFormCreditLimit(req, existing);
  const customer = await customerService.updateCustomerById(req.params.customerId, req.body);
  await creditControlService.recordFormLimitChange(customer, previousLimit, { id: req.user.id, name: req.user.name });
  res.send(customer);
});

const deleteCustomer = catchAsync(async (req, res) => {
  await customerService.deleteCustomerById(req.params.customerId);
  res.status(httpStatus.NO_CONTENT).send();
});

const bulkUpdateCustomers = catchAsync(async (req, res) => {
  const { customers } = req.body;
  const result = await customerService.bulkUpdateCustomers(customers);
  res.send({ message: `Updated ${result.modifiedCount} customer(s)`, ...result });
});

const bulkDeleteCustomers = catchAsync(async (req, res) => {
  const { ids } = req.body;
  const { deleted, notFoundIds } = await customerService.bulkDeleteCustomersByIds(ids);
  res.send({
    message: `Deleted ${deleted.length} of ${ids.length} customer(s)`,
    deletedCount: deleted.length,
    deletedIds: deleted.map((customer) => customer._id),
    notFoundIds,
  });
});

const getCustomerStats = catchAsync(async (req, res) => {
  const filter = {};
  applyBranchFilter(filter, req);
  filter.isEmployeeAccount = { $ne: true };
  filter.isSupplierAccount = { $ne: true };
  const stats = await customerService.getCustomerStats(filter);
  res.send(stats);
});

const getAllCustomers = catchAsync(async (req, res) => {
  const filter = {};
  applyBranchFilter(filter, req);
  const customers = await customerService.getAllCustomers(filter, {
    includeEmployees: req.query.includeEmployees === 'true',
    includeSuppliers: req.query.includeSuppliers === 'true',
  });
  res.send(customers);
})

const bulkAddCustomers = catchAsync(async (req, res) => {
  const { customers, duplicateStrategy, openingBalanceDate } = req.body;

  if (!customers || !Array.isArray(customers) || customers.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Customers array is required');
  }

  // Without this, a request that arrives before the branch switcher has resolved (no
  // x-branch-id header) would try to insert every row with branchId: undefined, which
  // Mongoose's insertMany() rejects for the whole batch — the opaque "nothing was
  // imported" failure product.controller.js had to fix for the same reason.
  await resolveWriteBranchId(req);

  const [canManageCredit, creditSettings] = await Promise.all([
    userHasAnyPermission(req.user, ['manageCreditLimits']),
    creditControlService.getSettings(req.organizationId),
  ]);
  const result = await customerService.bulkAddCustomers(customers, getBranchContext(req), {
    duplicateStrategy,
    openingBalanceDate,
    canManageCredit,
    defaultCreditLimit: creditSettings.defaultCreditLimit,
    actor: { id: req.user.id, name: req.user.name },
  });

  const failedCount = result.errors?.length || 0;
  const parts = [];
  if (result.insertedCount) parts.push(`imported ${result.insertedCount}`);
  if (result.updatedCount) parts.push(`updated ${result.updatedCount}`);
  if (result.skippedCount) parts.push(`skipped ${result.skippedCount} already saved`);
  if (failedCount) parts.push(`${failedCount} row(s) could not be saved`);

  // Always a 201 carrying the full per-row breakdown, even when every row failed. A 400
  // would collapse "these 3 rows are wrong" into one unhelpful message and throw away
  // the detail the import dialog lists row by row — same contract as products/students.
  res.status(httpStatus.CREATED).send({
    message: parts.length ? `Import finished — ${parts.join(', ')}` : 'Nothing to import',
    ...result,
  });
});

const scanCustomerImage = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No image file provided');
  }

  const result = await customerVisionService.extractCustomersFromImage(
    req.file.buffer,
    req.file.mimetype || 'image/jpeg',
  );

  res.send(result);
});

const uploadCustomerImage = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No image file provided');
  }

  try {
    const result = await uploadToCloudinary(req.file.buffer, {
      public_id: `customer_${Date.now()}`,
      folder: 'customers',
    });

    res.send({
      url: result.secure_url,
      publicId: result.public_id,
    });
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Image upload failed');
  }
});

module.exports = {
  createCustomer,
  getCustomers,
  getCustomer,
  updateCustomer,
  deleteCustomer,
  bulkUpdateCustomers,
  bulkDeleteCustomers,
  getAllCustomers,
  getCustomerStats,
  bulkAddCustomers,
  scanCustomerImage,
  uploadCustomerImage,
};
