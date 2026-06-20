const httpStatus = require('http-status');
const { SimSale, Customer, Product } = require('../models');
const ApiError = require('../utils/ApiError');
const walletService = require('./wallet.service');
const walletEntryService = require('./walletEntry.service');
const cashBookService = require('./cashBook.service');
const customerLedgerService = require('./customerLedger.service');

const sanitizeId = (value) => {
  if (value === null || value === undefined || value === '') return null;
  return value;
};

const getLedgerPaymentMethodLabel = (paymentMethod) => {
  const normalized = String(paymentMethod || 'cash').toLowerCase();
  if (normalized === 'bank') return 'Bank Transfer';
  if (normalized === 'wallet') return 'Wallet';
  if (normalized === 'jazzcash') return 'JazzCash';
  if (normalized === 'easypaisa') return 'EasyPaisa';
  return 'Cash';
};

const getEffectivePaymentWalletType = (sale) => String(sale.paymentWalletType || '').trim();

const syncSimSalePaymentRecords = async (sale, previousPayment = null) => {
  const saleAmount = Number(sale.saleAmount || 0);
  const paymentMethod = String(sale.paymentMethod || 'cash').toLowerCase();
  const currentPaymentWalletType = getEffectivePaymentWalletType(sale);
  const isWalletPayment = paymentMethod === 'wallet';

  if (isWalletPayment && !currentPaymentWalletType) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Please select payment wallet for wallet payment method');
  }

  const prevMethod = String(previousPayment?.method || '').toLowerCase();
  const prevWalletType = String(previousPayment?.walletType || '').trim();
  const prevAmount = Number(previousPayment?.amount || 0);

  if (prevMethod === 'wallet' && prevWalletType && prevAmount > 0) {
    if (isWalletPayment && prevWalletType === currentPaymentWalletType) {
      const delta = saleAmount - prevAmount;
      if (delta !== 0) {
        await walletService.adjustWalletBalance({
          organizationId: sale.organizationId,
          branchId: sale.branchId,
          type: currentPaymentWalletType,
          amount: Math.abs(delta),
          operation: delta > 0 ? 'add' : 'deduct',
          userId: sale.updatedBy || sale.createdBy,
        });
      }
    } else {
      await walletService.adjustWalletBalance({
        organizationId: sale.organizationId,
        branchId: sale.branchId,
        type: prevWalletType,
        amount: prevAmount,
        operation: 'deduct',
        userId: sale.updatedBy || sale.createdBy,
      });
    }
  }

  if (isWalletPayment && saleAmount > 0 && !(prevMethod === 'wallet' && prevWalletType === currentPaymentWalletType)) {
    await walletService.adjustWalletBalance({
      organizationId: sale.organizationId,
      branchId: sale.branchId,
      type: currentPaymentWalletType,
      amount: saleAmount,
      operation: 'add',
      userId: sale.updatedBy || sale.createdBy,
    });
  }

  await cashBookService.deleteEntriesByReference(sale._id, 'SimSale');
  if (!isWalletPayment && saleAmount > 0) {
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
  }

  if (isWalletPayment && saleAmount > 0) {
    await walletEntryService.upsertReferenceEntry({
      organizationId: sale.organizationId,
      branchId: sale.branchId,
      walletType: currentPaymentWalletType,
      type: 'in',
      amount: saleAmount,
      referenceId: sale._id,
      referenceModel: 'SimSale',
      description: `Wallet payment received for Sim Sale #${sale.jobNumber}`,
      date: sale.date,
      createdBy: sale.createdBy,
      updatedBy: sale.updatedBy || sale.createdBy,
    });
  } else {
    await walletEntryService.deleteEntriesByReference(sale._id, 'SimSale');
  }
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

  const product = await Product.findOne({ _id: normalizedId, organizationId, branchId }).select('name price cost stockQuantity');
  if (!product) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Selected product not found in this branch');
  }
  return product;
};

/** Reserve one unit from inventory (one SIM per sale). */
const reserveProductStockForSimSale = async ({ productId, organizationId, branchId, productName }) => {
  const updated = await Product.findOneAndUpdate(
    {
      _id: productId,
      organizationId,
      branchId,
      stockQuantity: { $gte: 1 },
    },
    { $inc: { stockQuantity: -1 } },
    { new: true }
  );
  if (!updated) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Insufficient stock for ${productName || 'this SIM product'}. Add stock or pick another item.`
    );
  }
  return updated;
};

const releaseProductStockForSimSale = async ({ productId, organizationId, branchId }) => {
  if (!productId) return;
  await Product.findOneAndUpdate(
    { _id: productId, organizationId, branchId },
    { $inc: { stockQuantity: 1 } },
    { new: true }
  );
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
    paymentMethod: getLedgerPaymentMethodLabel(sale.paymentMethod),
    invoiceType: 'cash',
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

  let stockReservedForProductId = null;
  if (linkedProduct) {
    await reserveProductStockForSimSale({
      productId: linkedProduct._id,
      organizationId,
      branchId,
      productName: linkedProduct.name,
    });
    stockReservedForProductId = linkedProduct._id;
  }

  let sale;
  try {
    sale = await SimSale.create({
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
      paymentWalletType: body.paymentWalletType || '',
    });
  } catch (err) {
    if (stockReservedForProductId) {
      await releaseProductStockForSimSale({
        productId: stockReservedForProductId,
        organizationId,
        branchId,
      });
    }
    throw err;
  }

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

  await syncSimSalePaymentRecords(sale);

  // Sync customer ledger if customer selected
  await syncCustomerLedgerForSimSale(sale);

  return sale;
};

const querySimSales = async (filter, options) => {
  const queryFilter = { ...filter };
  const queryOptions = { ...options };

  if (queryOptions.search) {
    const search = String(queryOptions.search).trim();
    const digits = search.replace(/\D/g, '');
    const conditions = [];
    if (digits.length >= 2) {
      conditions.push({ customerMobile: { $regex: digits, $options: 'i' } });
      conditions.push({ customerCNIC: { $regex: digits, $options: 'i' } });
    }
    if (search.length >= 2) {
      conditions.push({ customerName: { $regex: search, $options: 'i' } });
    }
    if (conditions.length > 0) {
      queryFilter.$or = conditions;
    }
    delete queryOptions.search;
  }

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
  const previousPayment = {
    method: sale.paymentMethod,
    walletType: sale.paymentWalletType,
    amount: sale.saleAmount,
  };

  const linkedCustomer = await resolveLinkedCustomer({
    customerId: Object.prototype.hasOwnProperty.call(updateBody, 'customerId')
      ? updateBody.customerId
      : sale.customerId,
    organizationId: sale.organizationId,
    branchId: sale.branchId,
  });

  const linkedProduct = await resolveLinkedProduct({
    productId: Object.prototype.hasOwnProperty.call(updateBody, 'productId')
      ? updateBody.productId
      : sale.productId,
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
  if (Object.prototype.hasOwnProperty.call(updateBody, 'productId')) {
    newProductId = linkedProduct ? linkedProduct._id : undefined;
  }
  let newCustomerId = sale.customerId;
  if (Object.prototype.hasOwnProperty.call(updateBody, 'customerId')) {
    newCustomerId = linkedCustomer ? linkedCustomer._id : undefined;
  }

  const previousProductId = sale.productId ? sale.productId.toString() : '';
  const nextProductId = newProductId ? newProductId.toString() : '';

  if (previousProductId !== nextProductId) {
    // Reserve the new SIM first so we never drop stock if inventory is insufficient.
    if (nextProductId) {
      await reserveProductStockForSimSale({
        productId: nextProductId,
        organizationId: sale.organizationId,
        branchId: sale.branchId,
        productName: linkedProduct?.name,
      });
    }
    if (previousProductId) {
      await releaseProductStockForSimSale({
        productId: previousProductId,
        organizationId: sale.organizationId,
        branchId: sale.branchId,
      });
    }
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
    paymentWalletType: updateBody.paymentMethod === 'wallet'
      ? (updateBody.paymentWalletType !== undefined ? updateBody.paymentWalletType : sale.paymentWalletType)
      : (updateBody.paymentMethod ? '' : sale.paymentWalletType),
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

  await syncSimSalePaymentRecords(sale, previousPayment);

  await syncCustomerLedgerForSimSale(sale);

  return sale;
};

const deleteSimSale = async (saleId) => {
  const sale = await SimSale.findById(saleId);
  if (!sale) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sim sale not found');
  }

  if (sale.productId) {
    await releaseProductStockForSimSale({
      productId: sale.productId,
      organizationId: sale.organizationId,
      branchId: sale.branchId,
    });
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
  await walletEntryService.deleteEntriesByReference(sale._id, 'SimSale');
  await customerLedgerService.deleteLedgerEntriesByReference(sale._id);

  if (sale.paymentMethod === 'wallet' && sale.paymentWalletType && Number(sale.saleAmount || 0) > 0) {
    await walletService.adjustWalletBalance({
      organizationId: sale.organizationId,
      branchId: sale.branchId,
      type: sale.paymentWalletType,
      amount: sale.saleAmount,
      operation: 'deduct',
      userId: sale.createdBy,
    });
  }

  await sale.deleteOne();
};

module.exports = {
  createSimSale,
  querySimSales,
  getSimSaleById,
  updateSimSale,
  deleteSimSale,
};
