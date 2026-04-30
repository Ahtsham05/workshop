const httpStatus = require('http-status');
const { Service, ServiceInvoice } = require('../models');
const ApiError = require('../utils/ApiError');
const cashBookService = require('./cashBook.service');

const syncServiceInvoiceCashEntry = async (invoice) => {
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
  const d = new Date(date || Date.now());
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const startOfDay = new Date(d);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(d);
  endOfDay.setHours(23, 59, 59, 999);

  const count = await ServiceInvoice.countDocuments({
    organizationId: scope.organizationId,
    branchId: scope.branchId,
    date: { $gte: startOfDay, $lte: endOfDay },
  });

  return `SVC-${yyyy}${mm}${dd}-${String(count + 1).padStart(3, '0')}`;
};

const createServiceInvoice = async (invoiceBody) => {
  if (!Array.isArray(invoiceBody.items) || invoiceBody.items.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'At least one service is required');
  }

  const uniqueServiceIds = [...new Set(invoiceBody.items.map((i) => String(i.serviceId)))];
  const services = await Service.find({
    organizationId: invoiceBody.organizationId,
    branchId: invoiceBody.branchId,
    _id: { $in: uniqueServiceIds },
  }).lean();

  if (services.length !== uniqueServiceIds.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'One or more selected services do not exist');
  }

  const serviceMap = new Map(services.map((s) => [String(s._id), s]));
  const items = invoiceBody.items.map((item) => {
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
  const invoiceNumber = await buildInvoiceNumber(invoiceBody, invoiceBody.date);

  const invoice = await ServiceInvoice.create({
    organizationId: invoiceBody.organizationId,
    branchId: invoiceBody.branchId,
    invoiceNumber,
    customerName: invoiceBody.customerName || '',
    customerPhone: invoiceBody.customerPhone || '',
    items,
    subtotal,
    totalAmount: subtotal,
    paymentMethod: invoiceBody.paymentMethod || 'cash',
    date: invoiceBody.date || new Date(),
    notes: invoiceBody.notes || '',
    createdBy: invoiceBody.createdBy,
    updatedBy: invoiceBody.updatedBy,
  });

  await syncServiceInvoiceCashEntry(invoice);
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

  if (updateBody.customerName !== undefined) invoice.customerName = updateBody.customerName || '';
  if (updateBody.customerPhone !== undefined) invoice.customerPhone = updateBody.customerPhone || '';
  if (updateBody.paymentMethod !== undefined) invoice.paymentMethod = updateBody.paymentMethod || 'cash';
  if (updateBody.date !== undefined) invoice.date = updateBody.date || new Date();
  if (updateBody.notes !== undefined) invoice.notes = updateBody.notes || '';
  invoice.updatedBy = userId;

  await invoice.save();
  await syncServiceInvoiceCashEntry(invoice);
  return invoice;
};

const deleteServiceInvoiceById = async (invoiceId) => {
  const invoice = await getServiceInvoiceById(invoiceId);
  await cashBookService.deleteEntriesByReference(invoice._id, 'ServiceInvoice');
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
