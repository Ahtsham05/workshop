const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { InstallmentPlan, InstallmentPayment, Product } = require('../models');
const ApiError = require('../utils/ApiError');
const cashBookService = require('./cashBook.service');
const walletEntryService = require('./walletEntry.service');
const inventorySyncService = require('./inventorySync.service');

// Convert scope filter (string IDs) to ObjectIds for aggregate $match
const toAggregateScope = (scope) => {
  const s = {};
  if (scope.organizationId) s.organizationId = new mongoose.Types.ObjectId(scope.organizationId);
  if (scope.branchId)       s.branchId       = new mongoose.Types.ObjectId(scope.branchId);
  return s;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const generatePlanNumber = () => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `INS-${ts}-${rand}`;
};

const computeNextDueDate = (fromDate, paidInstallments, installmentFrequency = 'monthly') => {
  const d = new Date(fromDate);
  const periods = paidInstallments + 1;
  if (installmentFrequency === 'weekly') {
    d.setDate(d.getDate() + (periods * 7));
    return d;
  }
  if (installmentFrequency === 'biweekly') {
    d.setDate(d.getDate() + (periods * 15));
    return d;
  }
  d.setMonth(d.getMonth() + periods);
  return d;
};

// ── Plans ─────────────────────────────────────────────────────────────────────

const createInstallmentPlan = async (body) => {
  const product = await Product.findById(body.productId);
  if (!product) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Selected product not found');
  }

  const quantity = Number(body.quantity || 1);
  if (quantity < 1) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Quantity must be at least 1');
  }

  if (product.stockQuantity < quantity) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Insufficient stock for ${product.name}. Available: ${product.stockQuantity}, Requested: ${quantity}`
    );
  }

  const downPayment = Number(body.downPayment || 0);
  const totalAmount = Number(body.totalAmount);
  const remainingAmount = totalAmount - downPayment;
  const totalOutstanding = remainingAmount;
  const installmentFrequency = body.installmentFrequency || 'monthly';

  const startDate = body.startDate ? new Date(body.startDate) : new Date();
  const nextDueDate = body.nextDueDate || computeNextDueDate(startDate, 0, installmentFrequency);

  const stockReserved = await Product.findOneAndUpdate(
    { _id: body.productId, stockQuantity: { $gte: quantity } },
    { $inc: { stockQuantity: -quantity } },
    { new: true }
  );
  if (!stockReserved) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Insufficient stock for ${product.name}. Available: ${product.stockQuantity}, Requested: ${quantity}`
    );
  }

  let plan;
  try {
    plan = await InstallmentPlan.create({
      ...body,
      quantity,
      installmentFrequency,
      planNumber: generatePlanNumber(),
      downPayment,
      remainingAmount,
      totalOutstanding,
      totalPaid: downPayment,
      startDate,
      nextDueDate,
    });
  } catch (error) {
    await Product.findByIdAndUpdate(body.productId, { $inc: { stockQuantity: quantity } }, { new: true });
    throw error;
  }

  await inventorySyncService.recordStockChange({
    organizationId: product.organizationId,
    productId: product._id,
    quantityDelta: -quantity,
    type: 'sale',
    refType: 'InstallmentPlan',
    refId: plan._id,
    unitCost: product.cost,
    createdBy: body.createdBy,
  });

  // Record down payment if > 0
  if (downPayment > 0) {
    const paymentMethod = body.paymentMethod || 'cash';
    const isWalletPayment = paymentMethod === 'wallet' && body.walletType;

    // Record down payment entry
    const downPaymentEntry = await InstallmentPayment.create({
      organizationId: plan.organizationId,
      branchId: plan.branchId,
      installmentPlanId: plan._id,
      amount: downPayment,
      paymentNumber: 0,
      paymentMethod,
      walletType: body.walletType,
      isDownPayment: true,
      date: startDate,
      createdBy: plan.createdBy,
    });

    if (!isWalletPayment) {
      await cashBookService.createEntry({
        organizationId: plan.organizationId,
        branchId: plan.branchId,
        type: 'income',
        source: 'installment',
        amount: downPayment,
        paymentMethod,
        referenceId: plan._id,
        referenceModel: 'InstallmentPlan',
        description: `Installment down payment – ${plan.customerName} (${plan.itemDescription})`,
        date: startDate,
        createdBy: plan.createdBy,
      });
    }

    await walletEntryService.syncWalletPayment({
      organizationId: plan.organizationId,
      branchId: plan.branchId,
      referenceId: downPaymentEntry._id,
      referenceModel: 'InstallmentPayment',
      direction: 'in',
      amount: downPayment,
      paymentMethod,
      walletType: body.walletType,
      description: `Installment down payment – ${plan.customerName} (${plan.itemDescription})`,
      date: startDate,
      createdBy: plan.createdBy,
    });
  }

  return plan;
};

const queryInstallmentPlans = async (filter, options) => {
  const queryFilter = { ...filter };
  const queryOptions = { ...options };

  if (queryOptions.startDate || queryOptions.endDate) {
    queryFilter.startDate = {};
    if (queryOptions.startDate) { queryFilter.startDate.$gte = new Date(queryOptions.startDate); delete queryOptions.startDate; }
    if (queryOptions.endDate)   { queryFilter.startDate.$lte = new Date(queryOptions.endDate);   delete queryOptions.endDate; }
  }

  if (queryOptions.search) {
    const regex = new RegExp(queryOptions.search, 'i');
    queryFilter.$or = [
      { customerName: regex },
      { customerPhone: regex },
      { customerCNIC: regex },
      { planNumber: regex },
      { itemDescription: regex },
    ];
    delete queryOptions.search;
  }

  return InstallmentPlan.paginate(queryFilter, {
    ...queryOptions,
    sortBy: queryOptions.sortBy || 'createdAt:desc',
  });
};

const getInstallmentPlanById = async (planId) => {
  const plan = await InstallmentPlan.findById(planId);
  if (!plan) throw new ApiError(httpStatus.NOT_FOUND, 'Installment plan not found');
  return plan;
};

const updateInstallmentPlan = async (planId, updateBody, userId) => {
  const plan = await getInstallmentPlanById(planId);

  const nextFrequency = updateBody.installmentFrequency || plan.installmentFrequency || 'monthly';
  const nextStartDate = updateBody.startDate ? new Date(updateBody.startDate) : plan.startDate;
  const statusChangingToActive = updateBody.status === 'active' && plan.status !== 'active';
  const frequencyChanged = Boolean(updateBody.installmentFrequency) && updateBody.installmentFrequency !== plan.installmentFrequency;
  const startDateChanged = Boolean(updateBody.startDate);

  Object.assign(plan, updateBody, { updatedBy: userId, installmentFrequency: nextFrequency, startDate: nextStartDate });

  // Keep due schedule consistent whenever the frequency/start date changes or plan is re-activated.
  if (plan.status === 'active' && (statusChangingToActive || frequencyChanged || startDateChanged)) {
    if (plan.totalOutstanding > 0) {
      plan.nextDueDate = computeNextDueDate(nextStartDate, plan.paidInstallments, nextFrequency);
    } else {
      plan.nextDueDate = null;
      plan.status = 'completed';
    }
  }

  await plan.save();
  return plan;
};

const deleteInstallmentPlan = async (planId) => {
  const plan = await getInstallmentPlanById(planId);
  // Only restore stock if the plan was NOT completed.
  // A completed plan means the customer fully paid and kept the product,
  // so deleting it should not put the item back into inventory.
  if (plan.status !== 'completed' && plan.productId && Number(plan.quantity || 0) > 0) {
    const restoredQuantity = Number(plan.quantity);
    await Product.findByIdAndUpdate(
      plan.productId,
      { $inc: { stockQuantity: restoredQuantity } },
      { new: true }
    );
    await inventorySyncService.recordStockChange({
      organizationId: plan.organizationId,
      productId: plan.productId,
      quantityDelta: restoredQuantity,
      type: 'return_in',
      refType: 'InstallmentPlan',
      refId: plan._id,
    });
  }
  const payments = await InstallmentPayment.find({ installmentPlanId: plan._id });
  for (const payment of payments) {
    // eslint-disable-next-line no-await-in-loop
    await walletEntryService.reverseWalletPayment({
      organizationId: payment.organizationId,
      branchId: payment.branchId,
      referenceId: payment._id,
      referenceModel: 'InstallmentPayment',
      direction: 'in',
      amount: payment.amount,
      paymentMethod: payment.paymentMethod,
      walletType: payment.walletType,
      userId: plan.updatedBy || plan.createdBy,
    });
  }
  await InstallmentPayment.deleteMany({ installmentPlanId: plan._id });
  await cashBookService.deleteEntriesByReference(plan._id, 'InstallmentPlan');
  await cashBookService.deleteEntriesByReference(plan._id, 'InstallmentPayment');
  await plan.deleteOne();
  return plan;
};

// ── Payments ──────────────────────────────────────────────────────────────────

const recordPayment = async (planId, paymentBody, userId) => {
  const plan = await getInstallmentPlanById(planId);

  if (plan.status === 'completed' || plan.status === 'cancelled') {
    throw new ApiError(httpStatus.BAD_REQUEST, `Cannot record payment on a ${plan.status} plan`);
  }

  const amount = Number(paymentBody.amount);
  if (amount > plan.totalOutstanding) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Payment amount (${amount}) exceeds outstanding balance (${plan.totalOutstanding})`);
  }

  const paymentNumber = plan.paidInstallments + 1;
  const paymentDate = paymentBody.date ? new Date(paymentBody.date) : new Date();

  const paymentMethod = paymentBody.paymentMethod || 'cash';
  const isWalletPayment = paymentMethod === 'wallet' && paymentBody.walletType;

  const payment = await InstallmentPayment.create({
    organizationId: plan.organizationId,
    branchId: plan.branchId,
    installmentPlanId: plan._id,
    amount,
    paymentNumber,
    paymentMethod,
    walletType: paymentBody.walletType,
    isDownPayment: false,
    date: paymentDate,
    notes: paymentBody.notes || '',
    createdBy: userId,
  });

  // Update plan aggregates
  plan.paidInstallments += 1;
  plan.totalPaid += amount;
  plan.totalOutstanding -= amount;

  if (plan.totalOutstanding <= 0) {
    plan.totalOutstanding = 0;
    plan.status = 'completed';
    plan.nextDueDate = null;
  } else {
    plan.nextDueDate = computeNextDueDate(plan.startDate, plan.paidInstallments, plan.installmentFrequency);
  }
  plan.updatedBy = userId;
  await plan.save();

  if (!isWalletPayment) {
    // Cash book income entry
    await cashBookService.createEntry({
      organizationId: plan.organizationId,
      branchId: plan.branchId,
      type: 'income',
      source: 'installment',
      amount,
      paymentMethod,
      referenceId: payment._id,
      referenceModel: 'InstallmentPayment',
      description: `Installment #${paymentNumber} – ${plan.customerName} (${plan.itemDescription})`,
      date: paymentDate,
      createdBy: userId,
    });
  }

  await walletEntryService.syncWalletPayment({
    organizationId: plan.organizationId,
    branchId: plan.branchId,
    referenceId: payment._id,
    referenceModel: 'InstallmentPayment',
    direction: 'in',
    amount,
    paymentMethod,
    walletType: paymentBody.walletType,
    description: `Installment #${paymentNumber} – ${plan.customerName} (${plan.itemDescription})`,
    date: paymentDate,
    createdBy: userId,
  });

  return { payment, plan };
};

const getPaymentsByPlan = async (planId, options = {}) => {
  await getInstallmentPlanById(planId); // verify exists
  return InstallmentPayment.paginate(
    { installmentPlanId: planId },
    { ...options, sortBy: options.sortBy || 'date:asc', limit: options.limit || 50 }
  );
};

const deletePayment = async (planId, paymentId, userId) => {
  const plan = await getInstallmentPlanById(planId);
  const payment = await InstallmentPayment.findOne({ _id: paymentId, installmentPlanId: planId });
  if (!payment) throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found');
  if (payment.isDownPayment) throw new ApiError(httpStatus.BAD_REQUEST, 'Down payment cannot be deleted individually. Delete the entire plan instead.');

  // Reverse plan aggregates
  plan.paidInstallments = Math.max(0, plan.paidInstallments - 1);
  plan.totalPaid = Math.max(0, plan.totalPaid - payment.amount);
  plan.totalOutstanding += payment.amount;
  if (plan.status === 'completed') plan.status = 'active';
  plan.nextDueDate = computeNextDueDate(plan.startDate, plan.paidInstallments, plan.installmentFrequency);
  plan.updatedBy = userId;
  await plan.save();

  await cashBookService.deleteEntriesByReference(payment._id, 'InstallmentPayment');
  await walletEntryService.reverseWalletPayment({
    organizationId: payment.organizationId,
    branchId: payment.branchId,
    referenceId: payment._id,
    referenceModel: 'InstallmentPayment',
    direction: 'in',
    amount: payment.amount,
    paymentMethod: payment.paymentMethod,
    walletType: payment.walletType,
    userId,
  });
  await payment.deleteOne();
  return payment;
};

// ── Summary stats for dashboard ───────────────────────────────────────────────

const getInstallmentSummary = async (scope) => {
  const aggScope = toAggregateScope(scope);
  const [statusAgg, overdueCount, collectedAgg] = await Promise.all([
    InstallmentPlan.aggregate([
      { $match: aggScope },
      { $group: { _id: '$status', count: { $sum: 1 }, totalOutstanding: { $sum: '$totalOutstanding' }, totalAmount: { $sum: '$totalAmount' } } },
    ]),
    InstallmentPlan.countDocuments({ ...scope, status: 'active', nextDueDate: { $lt: new Date() } }),
    InstallmentPayment.aggregate([
      { $match: { ...aggScope, isDownPayment: false } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  const byStatus = {};
  statusAgg.forEach(s => { byStatus[s._id] = { count: s.count, totalOutstanding: s.totalOutstanding, totalAmount: s.totalAmount }; });

  return {
    active:        byStatus.active        || { count: 0, totalOutstanding: 0, totalAmount: 0 },
    completed:     byStatus.completed     || { count: 0, totalOutstanding: 0, totalAmount: 0 },
    defaulted:     byStatus.defaulted     || { count: 0, totalOutstanding: 0, totalAmount: 0 },
    cancelled:     byStatus.cancelled     || { count: 0, totalOutstanding: 0, totalAmount: 0 },
    overdueCount,
    totalCollected: collectedAgg[0]?.total || 0,
  };
};

module.exports = {
  createInstallmentPlan,
  queryInstallmentPlans,
  getInstallmentPlanById,
  updateInstallmentPlan,
  deleteInstallmentPlan,
  recordPayment,
  getPaymentsByPlan,
  deletePayment,
  getInstallmentSummary,
};
