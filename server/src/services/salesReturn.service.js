const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { SalesReturn, Invoice, Product, CustomerLedger, Customer, CashBookEntry, Organization } = require('../models');
const ApiError = require('../utils/ApiError');
const cashBookService = require('./cashBook.service');
const accountsSystemService = require('./accountsSystem.service');
const inventorySyncService = require('./inventorySync.service');
const inventoryService = require('./inventory.service');
const batchService = require('./batch.service');
const imeiService = require('./imei.service');
const salesmanCommissionLedgerService = require('./salesmanCommissionLedger.service');
const { normalizeBusinessType } = require('../config/businessTypes');
const { getStockQuantityFromItem } = require('../utils/inventoryUnitConversion');

/**
 * Resolves exactly which batches — and, for serial/IMEI-tracked lines, which specific
 * units — a returned quantity should credit back, using the *original* invoice line
 * (which still carries the full batchAllocations/imeis) rather than the single
 * batchId/batchNumber the return item mirrors for display. A full-line return (the
 * common case: return everything this line sold) can be traced exactly — every batch
 * gets back precisely what it gave. A partial return of a line split across several
 * batches is distributed proportionally to each batch's original share, since the
 * return form doesn't yet offer a batch/serial picker to say exactly which unit is
 * physically coming back. For that same reason, IMEI/serial restoration only ever
 * happens on a full-line return — guessing which of several sold serials came back
 * would risk marking the wrong physical unit as back in stock.
 */
const _resolveReturnRestores = (invoiceLineItem, returnedQuantity) => {
  if (!invoiceLineItem) return { batchAllocations: [], imeis: [] };

  const rawAllocations =
    Array.isArray(invoiceLineItem.batchAllocations) && invoiceLineItem.batchAllocations.length > 0
      ? invoiceLineItem.batchAllocations
      : invoiceLineItem.batchId
      ? [{ batchId: invoiceLineItem.batchId, quantity: Number(invoiceLineItem.stockQuantity ?? invoiceLineItem.quantity ?? 0) }]
      : [];

  const soldTotal = rawAllocations.reduce((sum, a) => sum + Number(a.quantity || 0), 0);
  let batchAllocations = [];
  if (rawAllocations.length > 0 && soldTotal > 0) {
    if (returnedQuantity >= soldTotal) {
      batchAllocations = rawAllocations.map((a) => ({ batchId: a.batchId, quantity: Number(a.quantity || 0) }));
    } else {
      let remaining = returnedQuantity;
      batchAllocations = rawAllocations
        .map((a, i) => {
          const isLast = i === rawAllocations.length - 1;
          const share = isLast
            ? remaining
            : Math.min(remaining, Math.round((Number(a.quantity || 0) / soldTotal) * returnedQuantity));
          remaining -= share;
          return { batchId: a.batchId, quantity: share };
        })
        .filter((a) => a.quantity > 0);
    }
  }

  const lineImeis = invoiceLineItem.imeis || [];
  const soldQtyForImeis = Number(invoiceLineItem.stockQuantity ?? invoiceLineItem.quantity ?? lineImeis.length);
  const imeis = lineImeis.length > 0 && returnedQuantity >= soldQtyForImeis ? lineImeis : [];

  return { batchAllocations, imeis };
};

const getOrganizationBusinessType = async (organizationId) => {
  if (!organizationId) {
    return 'other';
  }

  const organization = await Organization.findById(organizationId).select('businessType').lean();
  return normalizeBusinessType(organization?.businessType);
};

/**
 * Validate that return quantities do not exceed what was originally sold.
 * Also accounts for quantities already returned in previous partial returns.
 */
const validateReturnQuantities = async (invoice, returnItems) => {
  // Build a map of already-returned quantities for this invoice
  const previousReturns = await SalesReturn.find({
    invoiceId: invoice._id,
    status: { $ne: 'rejected' },
  });

  const alreadyReturnedMap = {};
  for (const ret of previousReturns) {
    for (const item of ret.items) {
      const key = item.productId.toString();
      alreadyReturnedMap[key] = (alreadyReturnedMap[key] || 0) + Number(item.stockQuantity || item.quantity || 0);
    }
  }

  // Build a map of sold quantities from the invoice items
  const soldMap = {};
  for (const item of invoice.items) {
    const key = item.productId.toString();
    soldMap[key] = (soldMap[key] || 0) + Number(item.stockQuantity || item.quantity || 0);
  }

  for (const returnItem of returnItems) {
    const key = returnItem.productId.toString();
    const soldQty = soldMap[key] || 0;
    const alreadyReturned = alreadyReturnedMap[key] || 0;
    const returnable = soldQty - alreadyReturned;
    const requestedStockQty = Number(returnItem.stockQuantity || returnItem.quantity || 0);

    if (requestedStockQty > returnable) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Cannot return ${returnItem.quantity} ${returnItem.unit || 'unit(s)'} of product ${returnItem.name}. ` +
          `Only ${returnable} unit(s) are returnable (sold: ${soldQty}, already returned: ${alreadyReturned}).`
      );
    }
  }
};

/**
 * Create a sales return (customer return).
 * - Increases stock for each returned product.
 * - Creates a CashBook entry based on refund method.
 * - Stores credit note info when refundMethod === 'adjustment'.
 */
const createSalesReturn = async (returnBody) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Validate the original invoice
    const invoice = await Invoice.findById(returnBody.invoiceId).session(session);
    if (!invoice) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
    }
    if (invoice.status === 'cancelled') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot create return for a cancelled invoice');
    }

    const businessType = await getOrganizationBusinessType(returnBody.organizationId);
    const invoiceItemsMap = new Map(
      (invoice.items || []).map((item) => [item.productId.toString(), item])
    );

    const normalizedItems = [];
    for (const item of returnBody.items) {
      const product = await Product.findOne({
        _id: item.productId,
        organizationId: returnBody.organizationId,
      }).session(session);

      if (!product) {
        throw new ApiError(httpStatus.NOT_FOUND, `Product ${item.productId} not found`);
      }

      const invoiceLineItem = invoiceItemsMap.get(item.productId.toString());
      const conversionInput = {
        ...item,
        unit: item.unit || invoiceLineItem?.unit,
        conversionFactor: item.conversionFactor || invoiceLineItem?.conversionFactor,
      };

      const conversion = getStockQuantityFromItem({ product, item: conversionInput, businessType });
      normalizedItems.push({
        ...item,
        unit: conversion.lineUnit,
        conversionFactor: conversion.conversionFactor,
        stockQuantity: conversion.stockQuantity,
        // Carry the variant/batch identity across from the original sale, so
        // batch/expiry reporting can trace which batch was actually returned — see
        // docs/architecture/universal-product-migration.md.
        variantId: item.variantId ?? invoiceLineItem?.variantId,
        batchId: item.batchId ?? invoiceLineItem?.batchId,
        batchNumber: item.batchNumber ?? invoiceLineItem?.batchNumber,
      });
    }

    // 2. Validate return quantities
    await validateReturnQuantities(invoice, normalizedItems);

    // 3. Persist the return document
    const [salesReturn] = await SalesReturn.create([
      {
        ...returnBody,
        items: normalizedItems,
      },
    ], { session });

    // 4. Increase stock for each returned item (atomic increment). Real-variant /
    // batch-tracked items restore via Inventory/Batch instead of the legacy
    // Product.stockQuantity fallback — see docs/architecture/universal-product-migration.md.
    // Those restores run after the transaction commits (batchService/inventoryService
    // don't participate in this Mongoose session), mirrored by `pendingVariantRestores`.
    const pendingStockSyncs = [];
    const pendingVariantRestores = [];
    const pendingImeiRestores = [];
    for (const item of normalizedItems) {
      const returnedQuantity = Number(item.stockQuantity || item.quantity || 0);
      if (item.variantId) {
        const invoiceLineItem = invoiceItemsMap.get(item.productId.toString());
        const { batchAllocations, imeis } = _resolveReturnRestores(invoiceLineItem, returnedQuantity);
        if (batchAllocations.length > 0) {
          for (const alloc of batchAllocations) {
            pendingVariantRestores.push({ variantId: item.variantId, batchId: alloc.batchId, quantity: alloc.quantity });
          }
        } else {
          // No batch on this line at all (non-batch-tracked variant) — plain restore.
          pendingVariantRestores.push({ variantId: item.variantId, batchId: undefined, quantity: returnedQuantity });
        }
        if (imeis.length > 0) {
          pendingImeiRestores.push({ productId: item.productId, imeis });
        }
        continue;
      }
      const updated = await Product.findOneAndUpdate(
        {
          _id: item.productId,
          organizationId: returnBody.organizationId,
        },
        { $inc: { stockQuantity: returnedQuantity } },
        { session, new: true }
      );
      if (!updated) {
        throw new ApiError(httpStatus.NOT_FOUND, `Product ${item.productId} not found`);
      }
      // Recorded after the transaction commits (see below) — recordStockChange runs
      // outside this session, so it must not fire until the legacy write is final.
      pendingStockSyncs.push({ productId: item.productId, quantityDelta: returnedQuantity });
    }

    // 5. Update invoice status to 'refunded' if all items are returned
    const allReturnedAfterThis = await _isFullyReturned(invoice, salesReturn.items);
    if (allReturnedAfterThis) {
      await Invoice.findByIdAndUpdate(
        invoice._id,
        { status: 'refunded' },
        { session }
      );
    }

    // 6. Customer Ledger entry (inside transaction)
    await _createCustomerLedgerEntry(salesReturn, session);

    // 7. CashBook entry (inside transaction)
    await _createCashBookEntryInSession(salesReturn, session);

    // 8. Claw back commission proportional to the returned amount (inside transaction)
    await salesmanCommissionLedgerService.reverseCommissionForSalesReturn(salesReturn, invoice, session);

    await session.commitTransaction();

    for (const sync of pendingStockSyncs) {
      await inventorySyncService.recordStockChange({
        organizationId: returnBody.organizationId,
        productId: sync.productId,
        quantityDelta: sync.quantityDelta,
        type: 'return_in',
        refType: 'SalesReturn',
        refId: salesReturn._id,
        createdBy: returnBody.createdBy,
      });
    }

    for (const restore of pendingVariantRestores) {
      if (restore.batchId) {
        await batchService.restoreToBatch(restore.batchId, restore.quantity, {
          refType: 'SalesReturn',
          refId: salesReturn._id,
          userId: returnBody.createdBy,
        });
      } else {
        await inventoryService.adjustInventory(restore.variantId, {
          quantityDelta: restore.quantity,
          type: 'return_in',
          refType: 'SalesReturn',
          refId: salesReturn._id,
          userId: returnBody.createdBy,
        });
      }
    }

    for (const restore of pendingImeiRestores) {
      await imeiService.releaseImeisByNumbers({
        invoiceId: invoice._id,
        productId: restore.productId,
        imeis: restore.imeis,
        organizationId: returnBody.organizationId,
        branchId: returnBody.branchId,
        note: `Returned via ${salesReturn.returnNumber}`,
      });
    }

    accountsSystemService
      .postSalesReturn(
        { organizationId: salesReturn.organizationId, branchId: salesReturn.branchId, createdBy: salesReturn.createdBy },
        salesReturn
      )
      .catch(() => {});

    return salesReturn;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

/**
 * Check whether the invoice is fully returned (all sold quantities accounted for).
 */
const _isFullyReturned = async (invoice, newItems) => {
  const previousReturns = await SalesReturn.find({
    invoiceId: invoice._id,
    status: { $ne: 'rejected' },
  });

  const returnedMap = {};
  for (const ret of previousReturns) {
    for (const item of ret.items) {
      const key = item.productId.toString();
      returnedMap[key] = (returnedMap[key] || 0) + Number(item.stockQuantity || item.quantity || 0);
    }
  }
  // Include the current return's items
  for (const item of newItems) {
    const key = item.productId.toString();
    returnedMap[key] = (returnedMap[key] || 0) + Number(item.stockQuantity || item.quantity || 0);
  }

  for (const soldItem of invoice.items) {
    const returned = returnedMap[soldItem.productId.toString()] || 0;
    const soldStockQuantity = Number(soldItem.stockQuantity || soldItem.quantity || 0);
    if (returned < soldStockQuantity) {
      return false;
    }
  }
  return true;
};

/**
 * Create a CustomerLedger entry for a sales return (transactional).
 * - cash/jazzcash/easypaisa: debit (money going out to customer)
 * - adjustment: credit (store as customer credit / reduce their outstanding balance)
 */
const _createCustomerLedgerEntry = async (salesReturn, session) => {
  if (!salesReturn.customerId) return;

  // Get the running balance for this customer
  const lastEntry = await CustomerLedger.findOne({ customer: salesReturn.customerId })
    .sort({ transactionDate: -1, createdAt: -1 })
    .select('balance')
    .session(session);

  const currentBalance = lastEntry ? lastEntry.balance : 0;
  let debit = 0;
  let credit = 0;
  let newBalance = currentBalance;

  // Sales return always REDUCES what the customer owes us → Credit column
  credit = salesReturn.totalAmount;
  newBalance = currentBalance - salesReturn.totalAmount;

  await CustomerLedger.create(
    [
      {
        organizationId: salesReturn.organizationId,
        branchId: salesReturn.branchId,
        customer: salesReturn.customerId,
        transactionType: 'sales_return',
        transactionDate: salesReturn.date || new Date(),
        reference: salesReturn.returnNumber,
        referenceId: salesReturn._id,
        description: `Sales return ${salesReturn.returnNumber}${salesReturn.reason ? ` - ${salesReturn.reason}` : ''}`,
        debit,
        credit,
        balance: newBalance,
        paymentMethod: { cash: 'Cash', jazzcash: 'Bank Transfer', easypaisa: 'Bank Transfer', adjustment: 'Credit' }[salesReturn.refundMethod],
        createdBy: salesReturn.createdBy,
      },
    ],
    { session }
  );

  // Keep Customer.balance in sync so the balance card is always accurate
  await Customer.findByIdAndUpdate(
    salesReturn.customerId,
    { $inc: { balance: -salesReturn.totalAmount } },
    { session }
  );
};

/**
 * Create a CashBook entry for a sales return inside a transaction session.
 * Sales returns are an expense (money going back to customer).
 */
const _createCashBookEntryInSession = async (salesReturn, session) => {
  if (salesReturn.refundMethod === 'adjustment') {
    // No cash movement – recorded as customer credit in ledger
    return;
  }

  const methodMap = {
    cash: 'cash',
    jazzcash: 'jazzcash',
    easypaisa: 'easypaisa',
  };

  await CashBookEntry.create(
    [
      {
        organizationId: salesReturn.organizationId,
        branchId: salesReturn.branchId,
        type: 'expense',
        source: 'sales_return',
        amount: salesReturn.totalAmount,
        paymentMethod: methodMap[salesReturn.refundMethod] || 'cash',
        referenceId: salesReturn._id,
        referenceModel: 'SalesReturn',
        description: `Sales return ${salesReturn.returnNumber} - Refund to customer`,
        date: salesReturn.date,
        createdBy: salesReturn.createdBy,
      },
    ],
    { session }
  );
};

/**
 * Query sales returns with pagination and date/product/customer filters.
 */
const querySalesReturns = async (filter, options) => {
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

  if (queryOptions.search) {
    queryFilter.$or = [
      { returnNumber: { $regex: queryOptions.search, $options: 'i' } },
      { reason: { $regex: queryOptions.search, $options: 'i' } },
      { customerName: { $regex: queryOptions.search, $options: 'i' } },
    ];
    delete queryOptions.search;
  }

  return SalesReturn.paginate(queryFilter, {
    ...queryOptions,
    sortBy: queryOptions.sortBy || 'date:desc',
    populate: 'invoiceId customerId createdBy',
  });
};

const getSalesReturnById = async (id) => {
  const ret = await SalesReturn.findById(id)
    .populate('invoiceId')
    .populate('customerId')
    .populate('createdBy', 'name email');
  if (!ret) throw new ApiError(httpStatus.NOT_FOUND, 'Sales return not found');
  return ret;
};

/**
 * Reverses the stock (and, where a full line was returned, the IMEI status) that a
 * sales return applied on creation — used when the return is rejected or deleted.
 * Re-fetches the original invoice to resolve the same real batchAllocations/imeis that
 * `createSalesReturn` used, instead of the single batchId/batchNumber mirrored onto the
 * return item, so reversing a multi-batch or serialized return debits the same batches
 * (and reclaims the same units) it originally credited.
 */
const _reverseSalesReturnStock = async (ret, { userId } = {}) => {
  const invoice = await Invoice.findById(ret.invoiceId).lean();
  const invoiceItemsMap = new Map((invoice?.items || []).map((item) => [item.productId.toString(), item]));

  for (const item of ret.items) {
    const returnedQuantity = Number(item.stockQuantity || item.quantity || 0);
    const reversedQuantity = -returnedQuantity;
    if (item.variantId) {
      const invoiceLineItem = invoiceItemsMap.get(item.productId.toString());
      const { batchAllocations, imeis } = _resolveReturnRestores(invoiceLineItem, returnedQuantity);
      if (batchAllocations.length > 0) {
        for (const alloc of batchAllocations) {
          await batchService.restoreToBatch(alloc.batchId, -alloc.quantity, {
            refType: 'SalesReturn',
            refId: ret._id,
            userId,
          });
        }
      } else {
        await inventoryService.adjustInventory(item.variantId, {
          quantityDelta: reversedQuantity,
          type: 'return_out',
          refType: 'SalesReturn',
          refId: ret._id,
          userId,
        });
      }
      if (imeis.length > 0) {
        await imeiService.reclaimImeisForReturn({
          invoiceId: ret.invoiceId,
          productId: item.productId,
          imeis,
          organizationId: ret.organizationId,
          branchId: ret.branchId,
        });
      }
      continue;
    }
    await Product.findByIdAndUpdate(item.productId, {
      $inc: { stockQuantity: reversedQuantity },
    });
    await inventorySyncService.recordStockChange({
      organizationId: ret.organizationId,
      productId: item.productId,
      quantityDelta: reversedQuantity,
      type: 'return_out',
      refType: 'SalesReturn',
      refId: ret._id,
      createdBy: userId,
    });
  }
};

/**
 * Approve or reject a pending sales return.
 */
const updateSalesReturnStatus = async (id, status, userId, rejectionReason) => {
  const ret = await SalesReturn.findById(id);
  if (!ret) throw new ApiError(httpStatus.NOT_FOUND, 'Sales return not found');
  if (ret.status !== 'pending') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Only pending returns can be approved or rejected');
  }

  ret.status = status;
  ret.approvedBy = userId;
  ret.approvedAt = new Date();
  if (status === 'rejected' && rejectionReason) {
    ret.rejectionReason = rejectionReason;
  }
  await ret.save();

  if (status === 'approved') {
    // Stock already increased on creation — create cash entry now
    await _createCashBookEntry(ret);
  } else if (status === 'rejected') {
    // Reverse stock (and IMEI status) that was applied at creation time.
    await _reverseSalesReturnStock(ret, { userId });
  }

  return ret;
};

const deleteSalesReturn = async (id) => {
  const ret = await SalesReturn.findById(id);
  if (!ret) throw new ApiError(httpStatus.NOT_FOUND, 'Sales return not found');

  // Reverse stock (and IMEI status) that was applied at creation time.
  await _reverseSalesReturnStock(ret, {});

  // Remove cash book entry if any
  await cashBookService.deleteEntriesByReference(ret._id, 'SalesReturn');
  accountsSystemService
    .removePostingsForReference(
      { organizationId: ret.organizationId, branchId: ret.branchId },
      'SalesReturn',
      ret._id
    )
    .catch(() => {});

  await SalesReturn.findByIdAndDelete(id);
};

module.exports = {
  createSalesReturn,
  querySalesReturns,
  getSalesReturnById,
  updateSalesReturnStatus,
  deleteSalesReturn,
};
