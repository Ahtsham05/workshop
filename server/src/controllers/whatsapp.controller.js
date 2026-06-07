const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { whatsappService } = require('../services');
const Student = require('../models/student.model');
const { applyBranchFilter } = require('../utils/branchFilter');

// ── Serverless / Vercel guard ──────────────────────────────────────────────────
// whatsapp-web.js uses Puppeteer (Chrome) and keeps an in-memory WebSocket
// connection alive. Neither works on Vercel serverless functions because:
//   1. Every request is a new process instance — in-memory state is lost.
//   2. Chrome binary is not available on Vercel.
//   3. The filesystem is read-only — session files cannot be written.
// This guard returns a clear 503 so the frontend can display a helpful message
// instead of hanging forever in "Connecting…".
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.FUNCTION_NAME);

function rejectIfServerless(res) {
  if (IS_SERVERLESS) {
    res.status(503).json({
      state: 'SERVERLESS_UNSUPPORTED',
      error: 'WhatsApp messaging requires a persistent server.',
      message:
        'This backend is deployed as a serverless function (Vercel/Lambda) which cannot ' +
        'run Chrome or maintain a persistent WebSocket connection. ' +
        'Deploy the backend to Railway, Render, Fly.io, or a VPS using the provided Dockerfile.',
    });
    return true;
  }
  return false;
}

// ── Connection Management ──────────────────────────────────────────────────────

/**
 * GET /whatsapp/status
 * Returns current WhatsApp connection state and QR image (if waiting to scan).
 */
const getStatus = catchAsync(async (req, res) => {
  if (rejectIfServerless(res)) return;
  const status = whatsappService.getStatus();
  // Disable ETag/caching so the client always gets a fresh status response
  res.set('Cache-Control', 'no-store');
  res.send(status);
});

/**
 * POST /whatsapp/connect
 * Always disconnects (clears any stale session) before initialising, so a
 * fresh QR code is guaranteed to appear every time the button is clicked.
 */
const connect = catchAsync(async (req, res) => {
  if (rejectIfServerless(res)) return;
  const current = whatsappService.getStatus();
  if (current.state === 'READY') {
    return res.send({ message: 'Already connected', state: 'READY' });
  }
  // Tear down any stale client + session files so Chrome always generates a
  // fresh QR rather than silently re-using an expired saved session.
  await whatsappService.disconnect();
  if (!whatsappService.probeChrome()) {
    const failed = whatsappService.getStatus();
    return res.status(503).send({
      message: failed.error || 'WhatsApp could not start on this server',
      state: 'INIT_FAILED',
      deployHint: failed.deployHint,
    });
  }
  // Fire and forget — client emits events asynchronously
  whatsappService.initialize().catch(() => {});
  res.send({ message: 'Initialising WhatsApp. Poll /whatsapp/status for QR code.', state: 'LOADING' });
});

/**
 * POST /whatsapp/disconnect
 * Destroy the current WhatsApp session.
 */
const disconnectWhatsApp = catchAsync(async (req, res) => {
  await whatsappService.disconnect();
  res.send({ message: 'WhatsApp disconnected', state: 'DISCONNECTED' });
});

/**
 * POST /whatsapp/clear-session
 * Delete saved session files and disconnect — forces a fresh QR scan next connect.
 */
const clearSession = catchAsync(async (req, res) => {
  await whatsappService.clearSession();
  res.send({ message: 'Session cleared. Reconnect to scan a new QR code.', state: 'DISCONNECTED' });
});

// ── Messaging ──────────────────────────────────────────────────────────────────

/**
 * POST /whatsapp/send
 * Body: { phone, message }
 * Send a message to a single phone number.
 */
const sendMessage = catchAsync(async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) throw new ApiError(httpStatus.BAD_REQUEST, 'phone and message are required');

  const result = await whatsappService.sendMessage(phone, message);
  if (!result.success) throw new ApiError(httpStatus.BAD_REQUEST, result.error);

  res.send({ success: true });
});

/**
 * POST /whatsapp/send-bulk
 * Body: { recipients: [{ phone, name }], message, delayMs? }
 * Send a message to an explicit list of phone numbers.
 */
const sendBulkMessages = catchAsync(async (req, res) => {
  const { recipients, message, delayMs } = req.body;
  if (!recipients?.length || !message) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'recipients (array) and message are required');
  }

  // Wait for all sends to finish and return real counts
  const result = await whatsappService.sendBulkMessages(recipients, message, { delayMs: delayMs ?? 1500 });
  res.send({ total: result.total, sent: result.sent, failed: result.failed });
});

/**
 * POST /whatsapp/send-to-class
 * Body: { classId, message }
 * Send a message to all active students in a class (via parent phone).
 */
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

  // Wait for all sends to finish and return real counts
  const result = await whatsappService.sendBulkMessages(recipients, message, { delayMs: 1500 });
  res.send({ total: result.total, sent: result.sent, failed: result.failed });
});

/**
 * POST /whatsapp/send-to-all
 * Body: { message, classId? }
 * Send a message to all active students (optionally filter by classId).
 */
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

  // Wait for all sends to finish and return real counts
  const result = await whatsappService.sendBulkMessages(recipients, message, { delayMs: 1500 });
  res.send({ total: result.total, sent: result.sent, failed: result.failed });
});

/**
 * POST /whatsapp/fee-alerts
 * Body: { studentIds?, classId?, message?, feeStatus? }
 * Send fee due/overdue alerts to parents of specified students.
 * Uses FeeVoucher model (the active fee system). Status values: unpaid | overdue | paid.
 */
const sendFeeAlerts = catchAsync(async (req, res) => {
  const { studentIds, classId, message, feeStatus } = req.body;

  const FeeVoucher = require('../models/feeVoucher.model');

  // Build status filter — frontend sends 'pending_overdue' | 'pending' | 'overdue'
  // FeeVoucher uses: 'unpaid' | 'overdue' | 'paid' | 'partial'
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

  // Group by student — keep the most overdue/largest amount per student
  const studentMap = new Map();
  for (const v of vouchers) {
    const student = v.studentId;
    if (!student?.parent?.phone) continue;
    const sid = String(student._id);
    const existing = studentMap.get(sid);
    const dueAmount = (v.totalAmount || 0) - (v.paidAmount || 0);
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
      .replace(/\{amount\}/gi, info.amount)
      .replace(/\{month\}/gi, info.month)
      .replace(/\{year\}/gi, info.year)
      .replace(/\{feeType\}/gi, info.feeType)
      .replace(/\{status\}/gi, info.status);
    recipients.push({ phone: info.phone, name: info.name, _message: text });
  }

  if (!recipients.length) {
    return res.send({ total: 0, sent: 0, failed: [], message: 'No matching fee vouchers with parent phone numbers found' });
  }

  // Wait for all sends to finish and return real counts
  let sent = 0;
  const failed = [];
  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    const { success, error } = await whatsappService.sendMessage(r.phone, r._message);
    if (success) {
      sent++;
    } else {
      failed.push({ phone: r.phone, name: r.name, reason: error || 'Send failed' });
    }
    if (i < recipients.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  res.send({ total: recipients.length, sent, failed });
});

/**
 * POST /whatsapp/send-document
 * Send any PDF/document via connected WhatsApp session.
 */
const sendDocument = catchAsync(async (req, res) => {
  if (rejectIfServerless(res)) return;
  const { phone, pdfBase64, filename, caption, mimetype } = req.body;
  if (!phone || !pdfBase64) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'phone and pdfBase64 are required');
  }

  const result = await whatsappService.sendDocument(phone, {
    data: pdfBase64,
    mimetype: mimetype || 'application/pdf',
    filename: filename || 'document.pdf',
    caption: caption || '',
  });

  if (!result.success) throw new ApiError(httpStatus.BAD_REQUEST, result.error);
  res.send({ success: true, message: 'Document sent on WhatsApp' });
});

/**
 * POST /whatsapp/send-invoice-pdf
 * Send invoice receipt PDF via connected WhatsApp session.
 */
const sendInvoicePdf = catchAsync(async (req, res) => {
  if (rejectIfServerless(res)) return;
  const { phone, pdfBase64, filename, caption, invoiceNumber } = req.body;
  if (!phone || !pdfBase64) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'phone and pdfBase64 are required');
  }

  const status = whatsappService.getStatus();
  if (status.state !== 'READY') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'WhatsApp is not connected. Open Settings → WhatsApp and scan the QR code first.',
    );
  }

  const safeFilename =
    filename || `Invoice-${String(invoiceNumber || 'invoice').replace(/[^\w.-]/g, '-')}.pdf`;
  const defaultCaption = invoiceNumber ? `Invoice ${invoiceNumber}` : 'Invoice';

  const result = await whatsappService.sendDocument(phone, {
    data: pdfBase64,
    mimetype: 'application/pdf',
    filename: safeFilename,
    caption: caption || defaultCaption,
  });

  if (!result.success) {
    throw new ApiError(httpStatus.BAD_REQUEST, result.error || 'Failed to send invoice on WhatsApp');
  }

  res.send({ success: true, message: 'Invoice PDF sent on WhatsApp' });
});

/**
 * POST /whatsapp/test
 * Verify the connection by sending a test message to the admin's own number (optional body.phone).
 */
const sendTest = catchAsync(async (req, res) => {
  if (rejectIfServerless(res)) return;
  const status = whatsappService.getStatus();
  if (status.state !== 'READY') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'WhatsApp is not connected yet');
  }

  const phone = req.body?.phone || req.user?.phone;
  if (!phone) {
    return res.send({
      success: true,
      message: 'WhatsApp is connected and ready to send messages.',
    });
  }

  const result = await whatsappService.sendMessage(
    phone,
    '✅ Test message from your business app. WhatsApp is connected successfully.',
  );
  if (!result.success) throw new ApiError(httpStatus.BAD_REQUEST, result.error);
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
