const httpStatus = require('http-status');
const { RepairJob } = require('../models');
const ApiError = require('../utils/ApiError');
const { parseBusinessDateTime, applyBusinessDateRange } = require('../utils/businessTimezone');
const cashBookService = require('./cashBook.service');

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

const syncRepairCashEntry = async (repairJob) => {
  // Use total charges when delivered/completed, otherwise use advance amount received
  const isSettled = repairJob.status === 'delivered' || repairJob.status === 'completed';
  const cashAmount = isSettled
    ? Number(repairJob.charges || 0)
    : Number(repairJob.advanceAmount || 0);

  if (cashAmount <= 0) {
    await cashBookService.deleteEntriesByReference(repairJob._id, 'RepairJob');
    return null;
  }

  return cashBookService.upsertReferenceEntry({
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
  Object.assign(repairJob, normalizeRepairJobDates(updateBody), { updatedBy: userId });

  if (repairJob.status === 'completed' && !repairJob.completedAt) {
    repairJob.completedAt = new Date();
  }
  if (repairJob.status === 'delivered' && !repairJob.deliveredAt) {
    repairJob.deliveredAt = new Date();
  }

  await repairJob.save();
  await syncRepairCashEntry(repairJob);
  return repairJob;
};

const deleteRepairJobById = async (repairJobId) => {
  const repairJob = await getRepairJobById(repairJobId);
  await cashBookService.deleteEntriesByReference(repairJob._id, 'RepairJob');
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
