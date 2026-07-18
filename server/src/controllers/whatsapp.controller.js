const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const Student = require('../models/student.model');
const { applyBranchFilter } = require('../utils/branchFilter');
const { connectionService, messagingService } = require('../services/whatsapp');

function requireCloudConnection(req) {
  if (!req.organizationId || !req.branchId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Branch context is required for WhatsApp');
  }
}

async function assertConnected(req) {
  requireCloudConnection(req);
  const connected = await messagingService.isConnected(req.organizationId, req.branchId);
  if (!connected) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'WhatsApp Cloud API is not connected. Go to Settings → WhatsApp and connect via Meta Embedded Signup.',
    );
  }
}

async function sendBulkViaCloud(req, recipients, getMessage) {
  await assertConnected(req);
  let sent = 0;
  const failed = [];
  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    const text = getMessage(r);
    try {
      await messagingService.sendText({
        organizationId: req.organizationId,
        branchId: req.branchId,
        phone: r.phone,
        text,
        source: 'api',
        sentBy: req.user?.id,
      });
      sent += 1;
    } catch (err) {
      failed.push({ phone: r.phone, name: r.name, reason: err.message || 'Send failed' });
    }
    if (i < recipients.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  }
  return { total: recipients.length, sent, failed };
}

const getStatus = catchAsync(async (req, res) => {
  requireCloudConnection(req);
  res.set('Cache-Control', 'no-store');
  const connection = await connectionService.getConnection(req.organizationId, req.branchId);
  const publicConn = connectionService.toPublicConnection(connection);
  res.send({
    state: publicConn.connected ? 'READY' : 'DISCONNECTED',
    connected: publicConn.connected,
    displayPhoneNumber: publicConn.displayPhoneNumber,
    verifiedName: publicConn.verifiedName,
    webhookSubscribed: publicConn.webhookSubscribed,
    status: publicConn.status,
    branchConnection: publicConn,
  });
});

const connect = catchAsync(async (req, res) => {
  requireCloudConnection(req);
  const payload = await connectionService.startEmbeddedSignup({
    organizationId: req.organizationId,
    branchId: req.branchId,
    userId: req.user.id,
  });
  res.send(payload);
});

const disconnectWhatsApp = catchAsync(async (req, res) => {
  requireCloudConnection(req);
  const connection = await connectionService.disconnect(req.organizationId, req.branchId);
  res.send({ message: 'WhatsApp disconnected', ...connectionService.toPublicConnection(connection) });
});

const clearSession = catchAsync(async (req, res) => {
  requireCloudConnection(req);
  const connection = await connectionService.disconnect(req.organizationId, req.branchId);
  res.send({ message: 'WhatsApp disconnected', ...connectionService.toPublicConnection(connection) });
});

const sendMessage = catchAsync(async (req, res) => {
  const { phone, message, templateCategory, templateParams } = req.body;
  if (!phone || !message) throw new ApiError(httpStatus.BAD_REQUEST, 'phone and message are required');
  await assertConnected(req);
  // Routes through messagingService.sendMessage (not sendText) so a send outside Meta's 24h
  // customer-service window fails fast with a clear reason — or falls back to an approved
  // template when the caller supplies templateCategory — instead of the Cloud API silently
  // accepting the free-form text and rejecting it asynchronously via webhook (error 131047).
  await messagingService.sendMessage({
    organizationId: req.organizationId,
    branchId: req.branchId,
    phone,
    text: message,
    templateCategory,
    templateParams,
    source: 'api',
    sentBy: req.user?.id,
  });
  res.send({ success: true });
});

const sendBulkMessages = catchAsync(async (req, res) => {
  const { recipients, message } = req.body;
  if (!recipients?.length || !message) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'recipients (array) and message are required');
  }
  const result = await sendBulkViaCloud(req, recipients, () => message);
  res.send(result);
});

const sendToClass = catchAsync(async (req, res) => {
  const { classId, message } = req.body;
  if (!classId || !message) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'classId and message are required');
  }
  const filter = { classId, status: 'active' };
  applyBranchFilter(filter, req);
  const students = await Student.find(filter).select('firstName lastName parent').lean();
  const recipients = students
    .filter((s) => s.parent?.phone)
    .map((s) => ({ phone: s.parent.phone, name: `${s.firstName} ${s.lastName}`.trim() }));
  if (!recipients.length) {
    return res.send({ total: 0, sent: 0, failed: [], message: 'No students with phone numbers found in this class' });
  }
  const result = await sendBulkViaCloud(req, recipients, (r) => message.replace(/\{name\}/gi, r.name));
  res.send(result);
});

const sendToAll = catchAsync(async (req, res) => {
  const { message, classId } = req.body;
  if (!message) throw new ApiError(httpStatus.BAD_REQUEST, 'message is required');
  const filter = { status: 'active' };
  if (classId) filter.classId = classId;
  applyBranchFilter(filter, req);
  const students = await Student.find(filter).select('firstName lastName parent').lean();
  const recipients = students
    .filter((s) => s.parent?.phone)
    .map((s) => ({ phone: s.parent.phone, name: `${s.firstName} ${s.lastName}`.trim() }));
  if (!recipients.length) {
    return res.send({ total: 0, sent: 0, failed: [], message: 'No students with phone numbers found' });
  }
  const result = await sendBulkViaCloud(req, recipients, (r) => message.replace(/\{name\}/gi, r.name));
  res.send(result);
});

const sendFeeAlerts = catchAsync(async (req, res) => {
  const { studentIds, classId, message, feeStatus } = req.body;
  const FeeVoucher = require('../models/feeVoucher.model');

  let statusFilter;
  if (!feeStatus || feeStatus === 'pending_overdue') {
    statusFilter = { $in: ['unpaid', 'overdue', 'partial'] };
  } else if (feeStatus === 'pending') {
    statusFilter = { $in: ['unpaid', 'partial'] };
  } else if (feeStatus === 'overdue') {
    statusFilter = 'overdue';
  } else {
    statusFilter = feeStatus;
  }

  const feeFilter = { status: statusFilter };
  applyBranchFilter(feeFilter, req);
  if (classId) feeFilter.classId = classId;
  if (studentIds?.length) feeFilter.studentId = { $in: studentIds };

  const vouchers = await FeeVoucher.find(feeFilter)
    .populate('studentId', 'firstName lastName parent')
    .lean();

  const studentMap = new Map();
  for (const v of vouchers) {
    const student = v.studentId;
    if (!student?.parent?.phone) continue;
    const sid = String(student._id);
    const dueAmount = (v.netAmount || v.totalAmount || 0) - (v.paidAmount || 0);
    const existing = studentMap.get(sid);
    if (!existing || dueAmount > existing.amount) {
      const feeLabel = v.feeItems?.length ? v.feeItems.map((f) => f.name).join(', ') : 'Tuition';
      studentMap.set(sid, {
        phone: student.parent.phone,
        name: `${student.firstName} ${student.lastName}`.trim(),
        amount: dueAmount,
        month: v.month || '',
        year: v.year || '',
        feeType: feeLabel,
        status: v.status,
      });
    }
  }

  const defaultTemplate =
    'Dear Parent, this is a reminder that the {feeType} fee of Rs. {amount} for {name} (Month: {month}/{year}) is {status}. Please clear the dues as soon as possible. Thank you.';

  const recipients = [];
  for (const [, info] of studentMap) {
    const text = (message || defaultTemplate)
      .replace(/\{name\}/gi, info.name)
      .replace(/\{amount\}/gi, String(info.amount))
      .replace(/\{month\}/gi, info.month)
      .replace(/\{year\}/gi, String(info.year))
      .replace(/\{feeType\}/gi, info.feeType)
      .replace(/\{status\}/gi, info.status);
    recipients.push({ phone: info.phone, name: info.name, _message: text });
  }

  if (!recipients.length) {
    return res.send({ total: 0, sent: 0, failed: [], message: 'No matching fee vouchers with parent phone numbers found' });
  }

  const result = await sendBulkViaCloud(req, recipients, (r) => r._message);
  res.send(result);
});

const sendDocument = catchAsync(async (req, res) => {
  const { phone, pdfBase64, filename, caption, mimetype } = req.body;
  if (!phone || !pdfBase64) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'phone and pdfBase64 are required');
  }
  await assertConnected(req);
  const result = await messagingService.sendDocument({
    organizationId: req.organizationId,
    branchId: req.branchId,
    phone,
    data: pdfBase64,
    filename: filename || 'document.pdf',
    caption: caption || '',
    source: 'invoice',
    sentBy: req.user?.id,
  });
  res.send({ success: true, message: 'Document sent on WhatsApp', wamid: result.wamid });
});

const sendInvoicePdf = catchAsync(async (req, res) => {
  const { phone, pdfBase64, filename, caption, invoiceNumber, templateParams } = req.body;
  if (!phone || !pdfBase64) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'phone and pdfBase64 are required');
  }
  await assertConnected(req);
  const safeFilename =
    filename || `Invoice-${String(invoiceNumber || 'invoice').replace(/[^\w.-]/g, '-')}.pdf`;
  const defaultCaption = invoiceNumber ? `Invoice ${invoiceNumber}` : 'Invoice';
  const result = await messagingService.sendDocumentMessage({
    organizationId: req.organizationId,
    branchId: req.branchId,
    phone,
    data: pdfBase64,
    filename: safeFilename,
    caption: caption || defaultCaption,
    source: 'invoice',
    sentBy: req.user?.id,
    templateCategory: 'invoice',
    templateParams: templateParams || (invoiceNumber ? [invoiceNumber] : []),
  });
  res.send({ success: true, message: 'Invoice PDF sent on WhatsApp', wamid: result.wamid });
});

const sendTest = catchAsync(async (req, res) => {
  await assertConnected(req);
  const phone = req.body?.phone || req.user?.phone;
  if (!phone) {
    return res.send({ success: true, message: 'WhatsApp Cloud API is connected and ready.' });
  }
  await messagingService.sendText({
    organizationId: req.organizationId,
    branchId: req.branchId,
    phone,
    text: 'Test message from your business app. WhatsApp Cloud API is connected successfully.',
    source: 'api',
    sentBy: req.user?.id,
  });
  res.send({ success: true, message: 'Test message sent' });
});

module.exports = {
  getStatus,
  connect,
  disconnectWhatsApp,
  clearSession,
  sendMessage,
  sendBulkMessages,
  sendToClass,
  sendToAll,
  sendFeeAlerts,
  sendDocument,
  sendInvoicePdf,
  sendTest,
};
