const httpStatus = require('http-status');
const { Service, ServiceInvoice, Customer } = require('../models');
const ApiError = require('../utils/ApiError');
const {
  parseBusinessDateTime,
  toBusinessCalendarDate,
  applyBusinessDateRange,
} = require('../utils/businessTimezone');
const { buildCustomerSaleLedgerEntries } = require('../utils/ledgerSettlement');
const cashBookService = require('./cashBook.service');
const customerLedgerService = require('./customerLedger.service');
const employeeLedgerService = require('./employeeLedger.service');

const sanitizeId = (value) => {
  if (value === null || value === undefined || value === '') return null;
  return value;
};

const resolveLinkedCustomer = async ({ customerId, organizationId, branchId }) => {
  const normalizedId = sanitizeId(customerId);
  if (!normalizedId) return null;

  const customer = await Customer.findOne({ _id: normalizedId, organizationId, branchId }).select('name phone mobile');
  if (!customer) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Selected customer not found in this branch');
  }
  return customer;
};

const normalizeServiceInvoiceDates = (body) => {
  const next = { ...body };
  if (next.date != null) {
    const parsed = parseBusinessDateTime(next.date);
    if (parsed) {
      next.date = parsed;
    }
  }
  return next;
};

const syncServiceInvoiceCashEntry = async (invoice) => {
  if (invoice.customerId) {
    await cashBookService.deleteEntriesByReference(invoice._id, 'ServiceInvoice');
    return null;
  }

  const cashAmount = Number(invoice.totalAmount || 0);
  if (cashAmount <= 0) {
    await cashBookService.deleteEntriesByReference(invoice._id, 'ServiceInvoice');
    return null;
  }

  return cashBookService.upsertReferenceEntry({
    organizationId: invoice.organizationId,
    branchId: invoice.branchId,
    type: 'income',
    source: 'service',
    amount: cashAmount,
    paymentMethod: invoice.paymentMethod,
    referenceId: invoice._id,
    referenceModel: 'ServiceInvoice',
    description: `Service Invoice: ${invoice.invoiceNumber}`,
    date: invoice.date,
    createdBy: invoice.createdBy,
  });
};

const syncServiceInvoiceCustomerLedger = async (invoice) => {
  await customerLedgerService.deleteLedgerEntriesByReference(invoice._id);

  if (!invoice.customerId) {
    await employeeLedgerService.deletePurchaseAdvanceForReference(invoice._id, 'ServiceInvoice');
    return;
  }

  const serviceNames = (invoice.items || []).map((item) => item.serviceName).filter(Boolean);
  const description = `Service invoice ${invoice.invoiceNumber}${serviceNames.length ? ` (${serviceNames.join(', ')})` : ''}`;
  const ledgerEntries = buildCustomerSaleLedgerEntries({
    organizationId: invoice.organizationId,
    branchId: invoice.branchId,
    customerId: invoice.customerId,
    referenceId: invoice._id,
    invoiceNumber: invoice.invoiceNumber,
    displayReference: invoice.invoiceNumber,
    description,
    transactionDate: invoice.date,
    total: invoice.totalAmount,
    paidAmount: 0,
    invoiceType: 'credit',
    paymentMethod: 'Credit',
    notes: invoice.notes || description,
    balance: Number(invoice.totalAmount || 0),
  });

  for (const entry of ledgerEntries) {
    await customerLedgerService.createLedgerEntry(entry);
  }

  await employeeLedgerService.syncPurchaseFromCustomerSale({
    organizationId: invoice.organizationId,
    branchId: invoice.branchId,
    customerId: invoice.customerId,
    referenceId: invoice._id,
    referenceModel: 'ServiceInvoice',
    reference: invoice.invoiceNumber,
    description,
    unpaidAmount: invoice.totalAmount,
    transactionDate: invoice.date,
    createdBy: invoice.createdBy,
    updatedBy: invoice.updatedBy,
  });
};

const syncServiceInvoiceRecords = async (invoice) => {
  await syncServiceInvoiceCashEntry(invoice);
  await syncServiceInvoiceCustomerLedger(invoice);
};

const createServiceDefinition = async (serviceBody) => {
  const existing = await Service.findOne({
    organizationId: serviceBody.organizationId,
    branchId: serviceBody.branchId,
    serviceName: serviceBody.serviceName,
  });

  if (existing) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Service with this name already exists');
  }

  const service = await Service.create(serviceBody);
  return service;
};

const queryServiceDefinitions = async (filter, options) => {
  const queryFilter = { ...filter };
  const queryOptions = { ...options };

  if (queryFilter.serviceName) {
    queryFilter.serviceName = { $regex: queryFilter.serviceName, $options: 'i' };
  }

  if (queryFilter.isActive !== undefined) {
    queryFilter.isActive = queryFilter.isActive === true || queryFilter.isActive === 'true';
  }

  return Service.paginate(queryFilter, {
    ...queryOptions,
    sortBy: queryOptions.sortBy || 'serviceName:asc',
  });
};

const getServiceDefinitionById = async (serviceId) => {
  const service = await Service.findById(serviceId);
  if (!service) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Service definition not found');
  }
  return service;
};

const updateServiceDefinitionById = async (serviceId, updateBody, userId) => {
  const service = await getServiceDefinitionById(serviceId);

  if (updateBody.serviceName && updateBody.serviceName !== service.serviceName) {
    const duplicate = await Service.findOne({
      organizationId: service.organizationId,
      branchId: service.branchId,
      serviceName: updateBody.serviceName,
      _id: { $ne: service._id },
    });
    if (duplicate) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Service with this name already exists');
    }
  }

  Object.assign(service, updateBody, { updatedBy: userId });
  await service.save();
  return service;
};

const deleteServiceDefinitionById = async (serviceId) => {
  const service = await getServiceDefinitionById(serviceId);
  const usedCount = await ServiceInvoice.countDocuments({ 'items.serviceId': service._id });
  if (usedCount > 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot delete service because it is used in invoices');
  }
  await service.deleteOne();
  return service;
};

const buildInvoiceNumber = async (scope, date) => {
  const d = parseBusinessDateTime(date) || new Date();
  const calendar = toBusinessCalendarDate(d);
  const [yyyy, mm, dd] = calendar.split('-');
  const prefix = `SVC-${yyyy}${mm}${dd}-`;

  // Derive the next sequence from existing invoiceNumber strings for this day's
  // prefix rather than counting by the `date` field range: a record whose `date`
  // doesn't fall in this calendar day (e.g. legacy/edited data) would otherwise
  // be invisible to the count, letting the generator hand out an already-used
  // number and hit E11000 on every retry.
  const existing = await ServiceInvoice.find({
    organizationId: scope.organizationId,
    branchId: scope.branchId,
    invoiceNumber: { $regex: `^${prefix}\\d+$` },
  })
    .select('invoiceNumber')
    .lean();

  let maxSeq = 0;
  existing.forEach((inv) => {
    const seq = parseInt(inv.invoiceNumber.slice(prefix.length), 10);
    if (Number.isFinite(seq)) {
      maxSeq = Math.max(maxSeq, seq);
    }
  });

  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
};

const createServiceInvoice = async (invoiceBody) => {
  const normalizedBody = normalizeServiceInvoiceDates(invoiceBody);
  if (!Array.isArray(normalizedBody.items) || normalizedBody.items.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'At least one service is required');
  }

  const uniqueServiceIds = [...new Set(normalizedBody.items.map((i) => String(i.serviceId)))];
  const services = await Service.find({
    organizationId: normalizedBody.organizationId,
    branchId: normalizedBody.branchId,
    _id: { $in: uniqueServiceIds },
  }).lean();

  if (services.length !== uniqueServiceIds.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'One or more selected services do not exist');
  }

  const serviceMap = new Map(services.map((s) => [String(s._id), s]));
  const items = normalizedBody.items.map((item) => {
    const service = serviceMap.get(String(item.serviceId));
    const quantity = Number(item.quantity || 0);
    if (!service || quantity <= 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid service item data');
    }
    const requestedUnitPrice = Number(item.unitPrice);
    const unitPrice = Number.isFinite(requestedUnitPrice) && requestedUnitPrice >= 0
      ? requestedUnitPrice
      : Number(service.price || 0);
    return {
      serviceId: service._id,
      serviceName: service.serviceName,
      unitPrice,
      quantity,
      total: unitPrice * quantity,
    };
  });

  const subtotal = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const linkedCustomer = await resolveLinkedCustomer({
    customerId: normalizedBody.customerId,
    organizationId: normalizedBody.organizationId,
    branchId: normalizedBody.branchId,
  });

  // Save with retry for duplicate invoice number race condition (E11000),
  // matching the pattern used in invoice.service.js / expense.service.js.
  let invoice;
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const invoiceNumber = await buildInvoiceNumber(normalizedBody, normalizedBody.date);
    try {
      // eslint-disable-next-line no-await-in-loop
      invoice = await ServiceInvoice.create({
        organizationId: normalizedBody.organizationId,
        branchId: normalizedBody.branchId,
        invoiceNumber,
        customerId: linkedCustomer ? linkedCustomer._id : undefined,
        customerName: normalizedBody.customerName || (linkedCustomer ? linkedCustomer.name : '') || '',
        customerPhone:
          normalizedBody.customerPhone ||
          (linkedCustomer ? linkedCustomer.phone || linkedCustomer.mobile || '' : '') ||
          '',
        items,
        subtotal,
        totalAmount: subtotal,
        paymentMethod: normalizedBody.paymentMethod || 'cash',
        date: normalizedBody.date || new Date(),
        notes: normalizedBody.notes || '',
        createdBy: normalizedBody.createdBy,
        updatedBy: normalizedBody.updatedBy,
      });
      break;
    } catch (err) {
      if (err.code === 11000 && err.keyPattern && err.keyPattern.invoiceNumber && attempt < MAX_RETRIES - 1) {
        continue;
      }
      throw err;
    }
  }

  await syncServiceInvoiceRecords(invoice);
  return invoice;
};

const buildServiceInvoiceItems = async (invoiceBody, currentInvoice) => {
  if (!Array.isArray(invoiceBody.items) || invoiceBody.items.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'At least one service is required');
  }

  const uniqueServiceIds = [...new Set(invoiceBody.items.map((i) => String(i.serviceId)))];
  const services = await Service.find({
    organizationId: currentInvoice.organizationId,
    branchId: currentInvoice.branchId,
    _id: { $in: uniqueServiceIds },
  }).lean();

  if (services.length !== uniqueServiceIds.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'One or more selected services do not exist');
  }

  const serviceMap = new Map(services.map((s) => [String(s._id), s]));
  return invoiceBody.items.map((item) => {
    const service = serviceMap.get(String(item.serviceId));
    const quantity = Number(item.quantity || 0);
    if (!service || quantity <= 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid service item data');
    }
    const requestedUnitPrice = Number(item.unitPrice);
    const unitPrice = Number.isFinite(requestedUnitPrice) && requestedUnitPrice >= 0
      ? requestedUnitPrice
      : Number(service.price || 0);
    return {
      serviceId: service._id,
      serviceName: service.serviceName,
      unitPrice,
      quantity,
      total: unitPrice * quantity,
    };
  });
};

const queryServiceInvoices = async (filter, options) => {
  const queryFilter = { ...filter };
  const queryOptions = { ...options };

  if (queryFilter.customerName) {
    queryFilter.customerName = { $regex: queryFilter.customerName, $options: 'i' };
  }
  if (queryFilter.invoiceNumber) {
    queryFilter.invoiceNumber = { $regex: queryFilter.invoiceNumber, $options: 'i' };
  }

  applyBusinessDateRange(queryOptions, 'date');
  if (queryOptions.date) {
    queryFilter.date = queryOptions.date;
    delete queryOptions.date;
  }

  return ServiceInvoice.paginate(queryFilter, {
    ...queryOptions,
    sortBy: queryOptions.sortBy || 'date:desc',
  });
};

const getServiceInvoiceById = async (invoiceId) => {
  const invoice = await ServiceInvoice.findById(invoiceId);
  if (!invoice) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Service invoice not found');
  }
  return invoice;
};

const updateServiceInvoiceById = async (invoiceId, updateBody, userId) => {
  const invoice = await getServiceInvoiceById(invoiceId);

  if (updateBody.items) {
    const items = await buildServiceInvoiceItems(updateBody, invoice);
    const subtotal = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
    invoice.items = items;
    invoice.subtotal = subtotal;
    invoice.totalAmount = subtotal;
  }

  if (updateBody.customerId !== undefined) {
    const linkedCustomer = await resolveLinkedCustomer({
      customerId: updateBody.customerId,
      organizationId: invoice.organizationId,
      branchId: invoice.branchId,
    });
    invoice.customerId = linkedCustomer ? linkedCustomer._id : undefined;
    if (linkedCustomer) {
      if (updateBody.customerName === undefined) invoice.customerName = linkedCustomer.name;
      if (updateBody.customerPhone === undefined) {
        invoice.customerPhone = linkedCustomer.phone || linkedCustomer.mobile || '';
      }
    }
  }

  if (updateBody.customerName !== undefined) invoice.customerName = updateBody.customerName || '';
  if (updateBody.customerPhone !== undefined) invoice.customerPhone = updateBody.customerPhone || '';
  if (updateBody.paymentMethod !== undefined) invoice.paymentMethod = updateBody.paymentMethod || 'cash';
  if (updateBody.date !== undefined) {
    invoice.date = parseBusinessDateTime(updateBody.date) || new Date();
  }
  if (updateBody.notes !== undefined) invoice.notes = updateBody.notes || '';
  invoice.updatedBy = userId;

  await invoice.save();
  await syncServiceInvoiceRecords(invoice);
  return invoice;
};

const deleteServiceInvoiceById = async (invoiceId) => {
  const invoice = await getServiceInvoiceById(invoiceId);
  await cashBookService.deleteEntriesByReference(invoice._id, 'ServiceInvoice');
  await customerLedgerService.deleteLedgerEntriesByReference(invoice._id);
  await employeeLedgerService.deletePurchaseAdvanceForReference(invoice._id, 'ServiceInvoice');
  await invoice.deleteOne();
  return invoice;
};

const getServiceInvoiceReport = async (scope, startDate, endDate) => {
  const baseMatch = {
    ...scope,
    date: { $gte: startDate, $lte: endDate },
  };

  const [summary, byService, byPaymentMethod, datewise, recentInvoices] = await Promise.all([
    ServiceInvoice.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: null,
          totalInvoices: { $sum: 1 },
          totalItems: { $sum: { $sum: '$items.quantity' } },
          totalAmount: { $sum: '$totalAmount' },
          totalProfit: { $sum: '$totalAmount' },
          avgInvoice: { $avg: '$totalAmount' },
        },
      },
    ]),
    ServiceInvoice.aggregate([
      { $match: baseMatch },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.serviceName',
          quantity: { $sum: '$items.quantity' },
          totalAmount: { $sum: '$items.total' },
          avgUnitPrice: { $avg: '$items.unitPrice' },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]),
    ServiceInvoice.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]),
    ServiceInvoice.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          invoices: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    ServiceInvoice.find(baseMatch).sort({ date: -1 }).limit(30).lean(),
  ]);

  return {
    summary: summary[0] || { totalInvoices: 0, totalItems: 0, totalAmount: 0, totalProfit: 0, avgInvoice: 0 },
    byService,
    byPaymentMethod,
    datewise,
    recentInvoices,
    period: {
      startDate,
      endDate,
    },
  };
};

module.exports = {
  createServiceDefinition,
  queryServiceDefinitions,
  getServiceDefinitionById,
  updateServiceDefinitionById,
  deleteServiceDefinitionById,
  createServiceInvoice,
  updateServiceInvoiceById,
  queryServiceInvoices,
  getServiceInvoiceById,
  deleteServiceInvoiceById,
  getServiceInvoiceReport,
};
