const httpStatus = require('http-status');
const { SimSale, Customer, Product } = require('../models');
const ApiError = require('../utils/ApiError');
const walletService = require('./wallet.service');
const cashBookService = require('./cashBook.service');
const customerLedgerService = require('./customerLedger.service');

const sanitizeId = (value) => {
  if (value === null || value === undefined || value === '') return null;
  return value;
};

const getNextJobNumber = async (organizationId, branchId) => {
  const last = await SimSale.findOne({ organizationId, branchId }).sort({ jobNumber: -1 }).select('jobNumber');
  return last ? last.jobNumber + 1 : 1;
};

const resolveLinkedCustomer = async ({ customerId, organizationId, branchId }) => {
  const normalizedId = sanitizeId(customerId);
  if (!normalizedId) return null;

  const customer = await Customer.findOne({ _id: normalizedId, organizationId, branchId }).select('name');
  if (!customer) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Selected customer not found in this branch');
  }
  return customer;
};

const resolveLinkedProduct = async ({ productId, organizationId, branchId }) => {
  const normalizedId = sanitizeId(productId);
  if (!normalizedId) return null;

  const product = await Product.findOne({ _id: normalizedId, organizationId, branchId }).select('name price');
  if (!product) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Selected product not found in this branch');
  }
  return product;
};

const syncCustomerLedgerForSimSale = async (sale) => {
  await customerLedgerService.deleteLedgerEntriesByReference(sale._id);

  if (!sale.customerId) return;

  await customerLedgerService.createLedgerEntry({
    organizationId: sale.organizationId,
    branchId: sale.branchId,
    customer: sale.customerId,
    transactionType: 'sale',
    transactionDate: sale.date,
    reference: `SIM-SALE-${String(sale._id).slice(-6).toUpperCase()}`,
    referenceId: sale._id,
    description: `Sim sale #${sale.jobNumber}${sale.productName ? ` (${sale.productName})` : ''}`,
    debit: Number(sale.saleAmount) || 0,
    credit: 0,
    paymentMethod: sale.paymentMethod === 'bank' ? 'Bank Transfer' : 'Cash',
    notes: sale.notes || '',
  });
};

const createSimSale = async (body) => {
  const { organizationId, branchId } = body;

  const [linkedCustomer, linkedProduct, jobNumber] = await Promise.all([
    resolveLinkedCustomer({ customerId: body.customerId, organizationId, branchId }),
    resolveLinkedProduct({ productId: body.productId, organizationId, branchId }),
    getNextJobNumber(organizationId, branchId),
  ]);

  const simAmount = Number(body.simAmount || 0);
  const loadAmount = Number(body.loadAmount || 0);
  const saleAmount = Number(body.saleAmount || 0);
  const purchaseAmount = simAmount + loadAmount;
  const commission = saleAmount - purchaseAmount;

  const sale = await SimSale.create({
    ...body,
    jobNumber,
    productId: linkedProduct ? linkedProduct._id : undefined,
    productName: body.productName || (linkedProduct ? linkedProduct.name : '') || '',
    customerId: linkedCustomer ? linkedCustomer._id : undefined,
    customerName: body.customerName || (linkedCustomer ? linkedCustomer.name : '') || '',
    simAmount,
    loadAmount,
    purchaseAmount,
    saleAmount,
    commission,
  });

  // Deduct load amount from wallet if a wallet/load-account is selected
  if (sale.walletType && loadAmount > 0) {
    await walletService.adjustWalletBalance({
      organizationId: sale.organizationId,
      branchId: sale.branchId,
      type: sale.walletType,
      amount: loadAmount,
      operation: 'deduct',
      userId: sale.createdBy,
    });
  }

  // Record in CashBook as income
  await cashBookService.createEntry({
    organizationId: sale.organizationId,
    branchId: sale.branchId,
    type: 'income',
    source: 'sale',
    amount: saleAmount,
    paymentMethod: sale.paymentMethod,
    referenceId: sale._id,
    referenceModel: 'SimSale',
    description: `Sim sale #${sale.jobNumber}${sale.productName ? ` - ${sale.productName}` : ''}`,
    date: sale.date,
    createdBy: sale.createdBy,
  });

  // Sync customer ledger if customer selected
  await syncCustomerLedgerForSimSale(sale);

  return sale;
};

const querySimSales = async (filter, options) => {
  const queryFilter = { ...filter };
  const queryOptions = { ...options };

  if (queryOptions.startDate || queryOptions.endDate) {
    queryFilter.date = {};
    if (queryOptions.startDate) {
      queryFilter.date.$gte = new Date(queryOptions.startDate);
      delete queryOptions.startDate;
    }
    if (queryOptions.endDate) {
      queryFilter.date.$lte = new Date(queryOptions.endDate);
      delete queryOptions.endDate;
    }
  }

  queryOptions.sortBy = queryOptions.sortBy || 'date:-1';
  queryOptions.populate = 'productId,customerId';

  return SimSale.paginate(queryFilter, queryOptions);
};

const getSimSaleById = async (id) => {
  const sale = await SimSale.findById(id).populate('productId customerId');
  if (!sale) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sim sale not found');
  }
  return sale;
};

const updateSimSale = async (saleId, updateBody) => {
  const sale = await SimSale.findById(saleId);
  if (!sale) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sim sale not found');
  }

  const oldLoadAmount = Number(sale.loadAmount || 0);
  const oldWalletType = sale.walletType;

  const linkedCustomer = await resolveLinkedCustomer({
    customerId: sanitizeId(updateBody.customerId) !== undefined ? updateBody.customerId : sale.customerId,
    organizationId: sale.organizationId,
    branchId: sale.branchId,
  });

  const linkedProduct = await resolveLinkedProduct({
    productId: sanitizeId(updateBody.productId) !== undefined ? updateBody.productId : sale.productId,
    organizationId: sale.organizationId,
    branchId: sale.branchId,
  });

  const simAmount = Number(updateBody.simAmount !== undefined ? updateBody.simAmount : sale.simAmount);
  const loadAmount = Number(updateBody.loadAmount !== undefined ? updateBody.loadAmount : sale.loadAmount);
  const saleAmount = Number(updateBody.saleAmount !== undefined ? updateBody.saleAmount : sale.saleAmount);
  const purchaseAmount = simAmount + loadAmount;
  const commission = saleAmount - purchaseAmount;
  const newWalletType = updateBody.walletType !== undefined ? updateBody.walletType : sale.walletType;

  let newProductId = sale.productId;
  if (sanitizeId(updateBody.productId) !== undefined) {
    newProductId = linkedProduct ? linkedProduct._id : undefined;
  }
  let newCustomerId = sale.customerId;
  if (sanitizeId(updateBody.customerId) !== undefined) {
    newCustomerId = linkedCustomer ? linkedCustomer._id : undefined;
  }

  Object.assign(sale, {
    ...updateBody,
    productId: newProductId,
    productName: updateBody.productName || (linkedProduct ? linkedProduct.name : '') || sale.productName,
    customerId: newCustomerId,
    customerName: updateBody.customerName || (linkedCustomer ? linkedCustomer.name : '') || sale.customerName,
    simAmount,
    loadAmount,
    purchaseAmount,
    saleAmount,
    commission,
    walletType: newWalletType,
  });

  await sale.save();

  // Reverse old wallet deduction and apply new one
  if (oldWalletType && oldLoadAmount > 0) {
    await walletService.adjustWalletBalance({
      organizationId: sale.organizationId,
      branchId: sale.branchId,
      type: oldWalletType,
      amount: oldLoadAmount,
      operation: 'add',
      userId: sale.createdBy,
    });
  }
  if (sale.walletType && loadAmount > 0) {
    await walletService.adjustWalletBalance({
      organizationId: sale.organizationId,
      branchId: sale.branchId,
      type: sale.walletType,
      amount: loadAmount,
      operation: 'deduct',
      userId: sale.createdBy,
    });
  }

  // Update cashbook entry
  await cashBookService.deleteEntriesByReference(sale._id, 'SimSale');
  await cashBookService.createEntry({
    organizationId: sale.organizationId,
    branchId: sale.branchId,
    type: 'income',
    source: 'sale',
    amount: saleAmount,
    paymentMethod: sale.paymentMethod,
    referenceId: sale._id,
    referenceModel: 'SimSale',
    description: `Sim sale #${sale.jobNumber}${sale.productName ? ` - ${sale.productName}` : ''}`,
    date: sale.date,
    createdBy: sale.createdBy,
  });

  await syncCustomerLedgerForSimSale(sale);

  return sale;
};

const deleteSimSale = async (saleId) => {
  const sale = await SimSale.findById(saleId);
  if (!sale) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sim sale not found');
  }

  // Restore wallet balance
  if (sale.walletType && sale.loadAmount > 0) {
    await walletService.adjustWalletBalance({
      organizationId: sale.organizationId,
      branchId: sale.branchId,
      type: sale.walletType,
      amount: sale.loadAmount,
      operation: 'add',
      userId: sale.createdBy,
    });
  }

  // Clean up cashbook and ledger
  await cashBookService.deleteEntriesByReference(sale._id, 'SimSale');
  await customerLedgerService.deleteLedgerEntriesByReference(sale._id);

  await sale.deleteOne();
};

module.exports = {
  createSimSale,
  querySimSales,
  getSimSaleById,
  updateSimSale,
  deleteSimSale,
};
