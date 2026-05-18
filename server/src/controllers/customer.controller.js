const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { customerService } = require('../services');
const pick = require('../utils/pick');
const { Sale, Transaction } = require('../models');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');
const ApiError = require('../utils/ApiError');
const { uploadToCloudinary } = require('../middlewares/upload');
const customerVisionService = require('../services/customerVision.service');

const createCustomer = catchAsync(async (req, res) => {
  const customer = await customerService.createCustomer({ ...req.body, ...getBranchContext(req) });
  res.status(httpStatus.CREATED).send(customer);
});

const getCustomers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'email', 'phone']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'fieldName']);
  const result = await customerService.queryCustomers(filter, options);
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
  const customer = await customerService.updateCustomerById(req.params.customerId, req.body);
  res.send(customer);
});

const deleteCustomer = catchAsync(async (req, res) => {
  await customerService.deleteCustomerById(req.params.customerId);
  res.status(httpStatus.NO_CONTENT).send();
});

const getAllCustomers = catchAsync(async (req, res) => {
  const filter = {};
  applyBranchFilter(filter, req);
  const customers = await customerService.getAllCustomers(filter);
  res.send(customers);
})

const bulkAddCustomers = catchAsync(async (req, res) => {
  try {
    const { customers } = req.body;
    
    if (!customers || !Array.isArray(customers) || customers.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Customers array is required');
    }

    const result = await customerService.bulkAddCustomers(customers, getBranchContext(req));
    
    res.status(httpStatus.CREATED).send({
      message: `Successfully imported ${result.insertedCount} customers`,
      ...result
    });
  } catch (error) {
    console.error('Bulk add error:', error);
    throw new ApiError(httpStatus.BAD_REQUEST, 'Bulk import failed: ' + error.message);
  }
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
  getAllCustomers,
  bulkAddCustomers,
  scanCustomerImage,
  uploadCustomerImage,
};
