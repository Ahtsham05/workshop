const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const Student = require('../models/student.model');
const FeeVoucher = require('../models/feeVoucher.model');
const Branch = require('../models/branch.model');
const SchoolSmsTemplate = require('../models/schoolSmsTemplate.model');
const { applyBranchFilter } = require('../utils/branchFilter');
const smsGatewayService = require('../services/smsGateway.service');
const { TEMPLATES, CATEGORIES, SAMPLE_CONTEXT } = require('../config/schoolSmsTemplates');
const { analyzeBody, renderBody } = require('../utils/smsSegments');

// Cap on how many parents a single request may text. Bulk SMS costs real money per
// segment and a mistyped filter should not be able to bill a school for its whole roster
// twice over, so oversized batches are refused rather than silently truncated.
const MAX_RECIPIENTS = 2000;

const DEFAULT_FEE_TEMPLATE =
  'Dear Parent, this is a reminder that the {feeType} fee of Rs. {amount} for {name} (Month: {month}/{year}) is {status}. Please clear the dues as soon as possible. Thank you.';

// {school} is the campus name parents recognise, not the org name — a multi-campus school
// sends under each branch's own identity.
async function getSchoolName(req) {
  if (!req.branchId) return '';
  const branch = await Branch.findById(req.branchId).select('name').lean();
  return branch?.name || '';
}

function studentName(student) {
  return [student?.firstName, student?.lastName].filter(Boolean).join(' ').trim();
}

function assertWithinLimit(recipients) {
  if (recipients.length > MAX_RECIPIENTS) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `This selection has ${recipients.length} recipients, over the ${MAX_RECIPIENTS} limit for one send. Narrow the filter (e.g. one class at a time) and send in batches.`,
    );
  }
}

// Active students of the branch (optionally one class) that actually have a parent phone.
// Students without one are returned separately so the caller can report them as skipped
// rather than have them vanish from the totals.
async function collectStudentRecipients(req, { classId, studentIds } = {}) {
  const filter = { status: 'active' };
  if (classId) filter.classId = classId;
  if (studentIds?.length) filter._id = { $in: studentIds };
  applyBranchFilter(filter, req);

  const [students, school] = await Promise.all([
    Student.find(filter)
      .select('firstName lastName admissionNo parent classId sectionId')
      .populate('classId', 'name')
      .populate('sectionId', 'name')
      .lean(),
    getSchoolName(req),
  ]);

  const withPhone = [];
  const withoutPhone = [];
  for (const s of students) {
    const phone = String(s.parent?.phone ?? '').trim();
    const name = studentName(s);
    const entry = {
      phone,
      name,
      admissionNo: s.admissionNo || '',
      vars: {
        name,
        class: s.classId?.name || '',
        section: s.sectionId?.name || '',
        admissionNo: s.admissionNo || '',
        fatherName: s.parent?.fatherName || '',
        school,
      },
    };
    if (phone) withPhone.push(entry);
    else withoutPhone.push(entry);
  }
  return { recipients: withPhone, skipped: withoutPhone };
}

// One alert per student (their largest outstanding voucher), matching the WhatsApp fee
// alert behaviour — a parent with three unpaid months gets one SMS, not three.
async function collectFeeAlertRecipients(req, { studentIds, classId, feeStatus, message }) {
  const school = await getSchoolName(req);
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
    .populate({
      path: 'studentId',
      select: 'firstName lastName admissionNo parent classId sectionId',
      populate: [
        { path: 'classId', select: 'name' },
        { path: 'sectionId', select: 'name' },
      ],
    })
    .lean();

  const byStudent = new Map();
  const skipped = [];
  for (const v of vouchers) {
    const student = v.studentId;
    if (!student) continue;
    const sid = String(student._id);
    const phone = String(student.parent?.phone ?? '').trim();
    const dueAmount = (v.netAmount || v.totalAmount || 0) - (v.paidAmount || 0);
    if (!phone) {
      if (!skipped.some((s) => s.id === sid)) {
        skipped.push({ id: sid, name: studentName(student), admissionNo: student.admissionNo || '' });
      }
      continue;
    }
    const existing = byStudent.get(sid);
    if (existing && existing.amount >= dueAmount) continue;
    byStudent.set(sid, {
      phone,
      name: studentName(student),
      admissionNo: student.admissionNo || '',
      amount: dueAmount,
      month: v.month || '',
      year: v.year || '',
      feeType: v.feeItems?.length ? v.feeItems.map((f) => f.name).join(', ') : 'Tuition',
      status: v.status,
      className: student.classId?.name || '',
      sectionName: student.sectionId?.name || '',
      fatherName: student.parent?.fatherName || '',
      school,
    });
  }

  const template = String(message ?? '').trim() || DEFAULT_FEE_TEMPLATE;
  const recipients = Array.from(byStudent.values()).map((info) => ({
    ...info,
    message: renderBody(template, {
      name: info.name,
      amount: info.amount,
      month: info.month,
      year: info.year,
      feeType: info.feeType,
      status: info.status,
      class: info.className,
      section: info.sectionName,
      admissionNo: info.admissionNo,
      fatherName: info.fatherName,
      school: info.school,
    }),
  }));

  return { recipients, skipped };
}

function emptyResult(message) {
  return { total: 0, sent: 0, failed: [], skipped: [], message };
}

// Every template is returned already filled in with realistic values and costed, so the
// picker can show the school the message a parent actually receives rather than the raw
// {placeholder} source — and what that message will cost per recipient.
function decorateTemplate(tpl, sample) {
  const preview = renderBody(tpl.body, sample);
  const info = analyzeBody(preview);
  return {
    ...tpl,
    preview,
    encoding: info.encoding,
    segments: info.segments,
    characters: info.characters,
  };
}

const listTemplates = catchAsync(async (req, res) => {
  const school = (await getSchoolName(req)) || SAMPLE_CONTEXT.school;
  const sample = { ...SAMPLE_CONTEXT, school };

  const query = { organizationId: req.organizationId };
  if (req.branchId) query.branchId = req.branchId;
  const custom = await SchoolSmsTemplate.find(query).sort({ createdAt: -1 }).lean();

  res.send({
    categories: [...CATEGORIES, ...(custom.length ? ['Saved'] : [])],
    sample,
    templates: [
      ...TEMPLATES.map((t) => decorateTemplate({ ...t, builtIn: true }, sample)),
      ...custom.map((t) =>
        decorateTemplate(
          {
            id: String(t._id),
            title: t.title,
            category: 'Saved',
            context: t.context,
            body: t.body,
            builtIn: false,
          },
          sample,
        ),
      ),
    ],
  });
});

const createTemplate = catchAsync(async (req, res) => {
  const { title, body, context } = req.body;
  const template = await SchoolSmsTemplate.create({
    organizationId: req.organizationId,
    branchId: req.branchId,
    title: String(title).trim(),
    body: String(body).trim(),
    context: context || 'broadcast',
    createdBy: req.user?.id,
  });
  res.status(httpStatus.CREATED).send({ id: String(template._id), title: template.title });
});

const deleteTemplate = catchAsync(async (req, res) => {
  const query = { _id: req.params.id, organizationId: req.organizationId };
  if (req.branchId) query.branchId = req.branchId;
  const deleted = await SchoolSmsTemplate.findOneAndDelete(query);
  if (!deleted) throw new ApiError(httpStatus.NOT_FOUND, 'Template not found');
  res.status(httpStatus.NO_CONTENT).send();
});

const getStatus = catchAsync(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const status = await smsGatewayService.getGatewayStatus({
    organizationId: req.organizationId,
    branchId: req.branchId,
  });
  res.send(status);
});

const sendMessage = catchAsync(async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'phone and message are required');
  }
  const msg = await smsGatewayService.sendSms({
    organizationId: req.organizationId,
    branchId: req.branchId,
    to: String(phone).trim(),
    message: String(message).trim(),
    source: 'school_single',
  });
  res.send({ success: true, status: msg.status });
});

// Takes student ids rather than raw phone numbers so the placeholders resolve from the
// same database read the other tabs use — a hand-passed {phone, name} pair could never fill
// {class} or {fatherName}.
const sendBulkMessages = catchAsync(async (req, res) => {
  const { studentIds, message } = req.body;
  if (!studentIds?.length || !message) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'studentIds (array) and message are required');
  }
  const { recipients, skipped } = await collectStudentRecipients(req, { studentIds });
  if (!recipients.length) {
    return res.send(emptyResult('Selected students do not have parent phone numbers'));
  }
  assertWithinLimit(recipients);
  const result = await smsGatewayService.sendBulkPersonalized({
    organizationId: req.organizationId,
    branchId: req.branchId,
    recipients: recipients.map((r) => ({ ...r, message: renderBody(message, r.vars) })),
    source: 'school_bulk',
  });
  res.send({ ...result, skipped });
});

const sendToClass = catchAsync(async (req, res) => {
  const { classId, message } = req.body;
  if (!classId || !message) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'classId and message are required');
  }
  const { recipients, skipped } = await collectStudentRecipients(req, { classId });
  if (!recipients.length) {
    return res.send(emptyResult('No students with parent phone numbers found in this class'));
  }
  assertWithinLimit(recipients);
  const result = await smsGatewayService.sendBulkPersonalized({
    organizationId: req.organizationId,
    branchId: req.branchId,
    recipients: recipients.map((r) => ({ ...r, message: renderBody(message, r.vars) })),
    source: 'school_broadcast',
  });
  res.send({ ...result, skipped });
});

const sendToAll = catchAsync(async (req, res) => {
  const { message, classId } = req.body;
  if (!message) throw new ApiError(httpStatus.BAD_REQUEST, 'message is required');
  const { recipients, skipped } = await collectStudentRecipients(req, { classId });
  if (!recipients.length) {
    return res.send(emptyResult('No students with parent phone numbers found'));
  }
  assertWithinLimit(recipients);
  const result = await smsGatewayService.sendBulkPersonalized({
    organizationId: req.organizationId,
    branchId: req.branchId,
    recipients: recipients.map((r) => ({ ...r, message: renderBody(message, r.vars) })),
    source: 'school_broadcast',
  });
  res.send({ ...result, skipped });
});

// Dry run for the Fee Alerts tab: same query and same rendered text as the real send, but
// nothing is dispatched. SMS bills per segment, so the user gets to see exactly who is on
// the list and what each parent will receive before committing to the spend.
const previewFeeAlerts = catchAsync(async (req, res) => {
  const { studentIds, classId, message, feeStatus } = req.body;
  const { recipients, skipped } = await collectFeeAlertRecipients(req, { studentIds, classId, feeStatus, message });
  res.send({
    total: recipients.length,
    skipped,
    recipients: recipients.slice(0, 200),
    truncated: recipients.length > 200,
    totalDue: recipients.reduce((sum, r) => sum + (r.amount || 0), 0),
  });
});

const sendFeeAlerts = catchAsync(async (req, res) => {
  const { studentIds, classId, message, feeStatus } = req.body;
  const { recipients, skipped } = await collectFeeAlertRecipients(req, { studentIds, classId, feeStatus, message });
  if (!recipients.length) {
    return res.send(emptyResult('No matching fee vouchers with parent phone numbers found'));
  }
  assertWithinLimit(recipients);
  const result = await smsGatewayService.sendBulkPersonalized({
    organizationId: req.organizationId,
    branchId: req.branchId,
    recipients,
    source: 'school_fee_alert',
  });
  res.send({ ...result, skipped });
});

module.exports = {
  getStatus,
  listTemplates,
  createTemplate,
  deleteTemplate,
  sendMessage,
  sendBulkMessages,
  sendToClass,
  sendToAll,
  previewFeeAlerts,
  sendFeeAlerts,
};
