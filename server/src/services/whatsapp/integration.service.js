const messagingService = require('./messaging.service');
const { Student, Invoice, Customer, FeeVoucher } = require('../../models');
const { normalizePhone } = require('../../utils/whatsappPhone');

async function sendInvoicePdf({ organizationId, branchId, phone, pdfBase64, filename, caption, sentBy }) {
  return messagingService.sendDocument({
    organizationId,
    branchId,
    phone,
    data: pdfBase64,
    filename,
    caption,
    source: 'invoice',
    sentBy,
  });
}

async function sendPaymentReminder({ organizationId, branchId, customerId, sentBy }) {
  const customer = await Customer.findOne({ _id: customerId, organizationId, branchId });
  if (!customer) throw new Error('Customer not found');
  const phone = normalizePhone(customer.whatsapp || customer.phone);
  if (!phone) throw new Error('Customer has no phone number');

  const invoices = await Invoice.find({
    organizationId,
    branchId,
    customerId,
    status: { $in: ['finalized', 'paid'] },
    type: 'credit',
    balance: { $gt: 0 },
  });
  const totalDue = invoices.reduce((s, i) => s + (i.balance || 0), 0);
  const text = `Payment Reminder: Dear ${customer.name}, your outstanding balance is Rs. ${totalDue}. Please clear at earliest convenience.`;
  return messagingService.sendText({ organizationId, branchId, phone, text, source: 'api', sentBy });
}

async function sendAttendanceAlert({ organizationId, branchId, studentId, date, sentBy }) {
  const student = await Student.findOne({ _id: studentId, organizationId, branchId });
  if (!student?.parent?.phone) throw new Error('Parent phone not found');
  const phone = normalizePhone(student.parent.phone);
  const text = `Attendance Alert: ${student.firstName} ${student.lastName} was marked ABSENT on ${new Date(date).toDateString()}.`;
  return messagingService.sendText({ organizationId, branchId, phone, text, source: 'attendance', sentBy });
}

async function sendFeeReminder({ organizationId, branchId, voucherId, sentBy }) {
  const voucher = await FeeVoucher.findOne({ _id: voucherId, organizationId, branchId }).populate('studentId');
  if (!voucher?.studentId?.parent?.phone) throw new Error('Parent phone not found');
  const phone = normalizePhone(voucher.studentId.parent.phone);
  const amount = Math.max(0, (voucher.netAmount || voucher.totalAmount || 0) - (voucher.paidAmount || 0));
  const text = `Fee Reminder: ${voucher.studentId.firstName}'s fee of Rs. ${amount} is due. Voucher #${voucher.voucherNumber || voucher._id}.`;
  return messagingService.sendText({ organizationId, branchId, phone, text, source: 'fee', sentBy });
}

async function sendResultNotification({ organizationId, branchId, studentId, examName, sentBy }) {
  const student = await Student.findOne({ _id: studentId, organizationId, branchId });
  if (!student?.parent?.phone) throw new Error('Parent phone not found');
  const phone = normalizePhone(student.parent.phone);
  const text = `Result Published: ${student.firstName}'s ${examName || 'exam'} results are now available. Contact school for details.`;
  return messagingService.sendText({ organizationId, branchId, phone, text, source: 'result', sentBy });
}

async function sendHolidayNotice({ organizationId, branchId, audience, message, sentBy }) {
  const campaignService = require('./campaign.service');
  const phones = await campaignService.resolveAudience(organizationId, branchId, audience);
  const results = [];
  for (const phone of phones) {
    try {
      await messagingService.sendText({ organizationId, branchId, phone, text: message, source: 'holiday', sentBy });
      results.push({ phone, success: true });
    } catch (err) {
      results.push({ phone, success: false, error: err.message });
    }
  }
  return results;
}

module.exports = {
  sendInvoicePdf,
  sendPaymentReminder,
  sendAttendanceAlert,
  sendFeeReminder,
  sendResultNotification,
  sendHolidayNotice,
};
