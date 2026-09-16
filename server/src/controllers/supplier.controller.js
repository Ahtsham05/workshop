const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { supplierService } = require('../services');
const pick = require('../utils/pick');
const { applyBranchFilter, getBranchContext, resolveWriteBranchId } = require('../utils/branchFilter');
const ApiError = require('../utils/ApiError');
const { uploadToCloudinary } = require('../middlewares/upload');
const supplierVisionService = require('../services/supplierVision.service');

const createSupplier = catchAsync(async (req, res) => {
  await resolveWriteBranchId(req);
  const supplier = await supplierService.createSupplier({ ...req.body, ...getBranchContext(req) });
  res.status(httpStatus.CREATED).send(supplier);
});

const getSuppliers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'email', 'phone', 'isActive']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'fieldName']);
  const result = await supplierService.querySuppliers(filter, options);
  res.send(result);
});

const getSupplier = catchAsync(async (req, res) => {
  const supplier = await supplierService.getSupplierById(req.params.supplierId);
  if (!supplier) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found');
  }
  res.send(supplier);
});

const updateSupplier = catchAsync(async (req, res) => {
  const supplier = await supplierService.updateSupplierById(req.params.supplierId, req.body);
  res.send(supplier);
});

const deleteSupplier = catchAsync(async (req, res) => {
  await supplierService.deleteSupplierById(req.params.supplierId);
  res.status(httpStatus.NO_CONTENT).send();
});

const bulkUpdateSuppliers = catchAsync(async (req, res) => {
  const { suppliers } = req.body;
  const result = await supplierService.bulkUpdateSuppliers(suppliers);
  res.send({ message: `Updated ${result.modifiedCount} supplier(s)`, ...result });
});

const bulkDeleteSuppliers = catchAsync(async (req, res) => {
  const { ids } = req.body;
  const { deleted, notFoundIds } = await supplierService.bulkDeleteSuppliersByIds(ids);
  res.send({
    message: `Deleted ${deleted.length} of ${ids.length} supplier(s)`,
    deletedCount: deleted.length,
    deletedIds: deleted.map((supplier) => supplier._id),
    notFoundIds,
  });
});

const getAllSuppliers = catchAsync(async (req, res) => {
  const filter = {};
  applyBranchFilter(filter, req);
  const suppliers = await supplierService.getAllSuppliers(filter);
  res.send(suppliers);
});

const getSupplierStats = catchAsync(async (req, res) => {
  const filter = {};
  applyBranchFilter(filter, req);
  const stats = await supplierService.getSupplierStats(filter);
  res.send(stats);
});

const bulkAddSuppliers = catchAsync(async (req, res) => {
  const { suppliers, duplicateStrategy } = req.body;

  if (!suppliers || !Array.isArray(suppliers) || suppliers.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Suppliers array is required');
  }

  // Without this, a request that arrives before the branch switcher has resolved (no
  // x-branch-id header) would try to insert every row with branchId: undefined, which
  // Mongoose's insertMany() rejects for the whole batch — the opaque "nothing was
  // imported" failure product.controller.js had to fix for the same reason.
  await resolveWriteBranchId(req);

  const result = await supplierService.bulkAddSuppliers(suppliers, getBranchContext(req), { duplicateStrategy });

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

const scanSupplierImage = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No image file provided');
  }

  const result = await supplierVisionService.extractSuppliersFromImage(
    req.file.buffer,
    req.file.mimetype || 'image/jpeg',
  );

  res.send(result);
});

const uploadSupplierImage = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No image file provided');
  }

  try {
    const result = await uploadToCloudinary(req.file.buffer, {
      public_id: `supplier_${Date.now()}`,
      folder: 'suppliers',
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
  createSupplier,
  getSuppliers,
  getSupplier,
  updateSupplier,
  deleteSupplier,
  bulkUpdateSuppliers,
  bulkDeleteSuppliers,
  getAllSuppliers,
  getSupplierStats,
  bulkAddSuppliers,
  scanSupplierImage,
  uploadSupplierImage,
};
