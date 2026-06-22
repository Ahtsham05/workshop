const httpStatus = require('http-status');
const { RepairJob } = require('../models');
const ApiError = require('../utils/ApiError');
const { parseBusinessDateTime, applyBusinessDateRange } = require('../utils/businessTimezone');
const cashBookService = require('./cashBook.service');
const walletEntryService = require('./walletEntry.service');

const normalizeRepairJobDates = (body) => {
  const next = { ...body };
  if (next.date != null) {
    const parsed = parseBusinessDateTime(next.date);
    if (parsed) {
      next.date = parsed;
    }
  }
  return next;
};

// Use total charges when delivered/completed, otherwise use advance amount received
const computeRepairCashAmount = (repairJob) => {
  const isSettled = repairJob.status === 'delivered' || repairJob.status === 'completed';
  return isSettled ? Number(repairJob.charges || 0) : Number(repairJob.advanceAmount || 0);
};

const syncRepairCashEntry = async (repairJob, previous = null) => {
  const cashAmount = computeRepairCashAmount(repairJob);
  const isWalletPayment = repairJob.paymentMethod === 'wallet' && repairJob.walletType;

  if (!isWalletPayment && cashAmount > 0) {
    await cashBookService.upsertReferenceEntry({
      organizationId: repairJob.organizationId,
      branchId: repairJob.branchId,
      type: 'income',
      source: 'repair',
      amount: cashAmount,
      paymentMethod: repairJob.paymentMethod,
      referenceId: repairJob._id,
      referenceModel: 'RepairJob',
      description: `Repair: ${repairJob.deviceModel} (${repairJob.customerName})`,
      date: repairJob.date,
      createdBy: repairJob.createdBy,
    });
  } else {
    await cashBookService.deleteEntriesByReference(repairJob._id, 'RepairJob');
  }

  await walletEntryService.syncWalletPayment({
    organizationId: repairJob.organizationId,
    branchId: repairJob.branchId,
    referenceId: repairJob._id,
    referenceModel: 'RepairJob',
    direction: 'in',
    amount: cashAmount,
    paymentMethod: repairJob.paymentMethod,
    walletType: repairJob.walletType,
    previousPaymentMethod: previous?.paymentMethod,
    previousWalletType: previous?.walletType,
    previousAmount: previous?.cashAmount,
    description: `Repair: ${repairJob.deviceModel} (${repairJob.customerName})`,
    date: repairJob.date,
    createdBy: repairJob.createdBy,
    updatedBy: repairJob.updatedBy,
  });
};

const createRepairJob = async (repairJobBody) => {
  const repairJob = await RepairJob.create(normalizeRepairJobDates(repairJobBody));
  await syncRepairCashEntry(repairJob);
  return repairJob;
};

const queryRepairJobs = async (filter, options) => {
  const queryFilter = { ...filter };
  const queryOptions = { ...options };

  applyBusinessDateRange(queryOptions, 'date');
  if (queryOptions.date) {
    queryFilter.date = queryOptions.date;
    delete queryOptions.date;
  }

  return RepairJob.paginate(queryFilter, {
    ...queryOptions,
    sortBy: queryOptions.sortBy || 'date:desc',
  });
};

const getRepairJobById = async (repairJobId) => {
  const repairJob = await RepairJob.findById(repairJobId);
  if (!repairJob) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Repair job not found');
  }

  return repairJob;
};

const updateRepairJobById = async (repairJobId, updateBody, userId) => {
  const repairJob = await getRepairJobById(repairJobId);
  const previous = {
    paymentMethod: repairJob.paymentMethod,
    walletType: repairJob.walletType,
    cashAmount: computeRepairCashAmount(repairJob),
  };

  Object.assign(repairJob, normalizeRepairJobDates(updateBody), { updatedBy: userId });

  if (repairJob.status === 'completed' && !repairJob.completedAt) {
    repairJob.completedAt = new Date();
  }
  if (repairJob.status === 'delivered' && !repairJob.deliveredAt) {
    repairJob.deliveredAt = new Date();
  }

  await repairJob.save();
  await syncRepairCashEntry(repairJob, previous);
  return repairJob;
};

const deleteRepairJobById = async (repairJobId) => {
  const repairJob = await getRepairJobById(repairJobId);
  await cashBookService.deleteEntriesByReference(repairJob._id, 'RepairJob');
  await walletEntryService.reverseWalletPayment({
    organizationId: repairJob.organizationId,
    branchId: repairJob.branchId,
    referenceId: repairJob._id,
    referenceModel: 'RepairJob',
    direction: 'in',
    amount: computeRepairCashAmount(repairJob),
    paymentMethod: repairJob.paymentMethod,
    walletType: repairJob.walletType,
    userId: repairJob.updatedBy || repairJob.createdBy,
  });
  await repairJob.deleteOne();
  return repairJob;
};

module.exports = {
  createRepairJob,
  queryRepairJobs,
  getRepairJobById,
  updateRepairJobById,
  deleteRepairJobById,
};
