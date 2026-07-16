const logger = require('../../config/logger');
const { Invoice, Customer, Organization } = require('../../models');
const messagingService = require('./messaging.service');
const invoicePdfService = require('./invoicePdf.service');
const customerLedgerService = require('../customerLedger.service');

/**
 * Generate and send the invoice PDF to the customer's WhatsApp number.
 * Fire-and-forget: a notification failure must never break invoice creation.
 */
async function sendInvoiceOnCreate(invoiceId) {
  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice || !invoice.customerId) return { sent: false, reason: 'no_customer' };

  const customer = await Customer.findById(invoice.customerId).lean();
  const phone = customer?.whatsapp || customer?.phone;
  if (!phone) return { sent: false, reason: 'no_whatsapp_number' };

  const isConnected = await messagingService.isConnected(invoice.organizationId, invoice.branchId);
  if (!isConnected) return { sent: false, reason: 'not_connected' };

  const organization = await Organization.findById(invoice.organizationId).select('name').lean();
  const pdfBuffer = await invoicePdfService.generateInvoicePdf(invoice, customer, organization);
  const previousBalance = await customerLedgerService.getBalanceBeforeReference(invoice.customerId, invoice._id);

  return messagingService.sendDocumentMessage({
    organizationId: invoice.organizationId,
    branchId: invoice.branchId,
    phone,
    data: pdfBuffer,
    filename: `Invoice-${invoice.invoiceNumber}.pdf`,
    caption: `Invoice ${invoice.invoiceNumber}${organization?.name ? ` from ${organization.name}` : ''} — Total: ${invoice.total}`,
    source: 'invoice',
    templateCategory: 'invoice',
    templateParams: [customer.name, invoice.invoiceNumber, invoice.total, previousBalance],
  });
}

/**
 * Send the customer their current ledger balance as a WhatsApp text message.
 */
async function sendLedgerUpdate(customerId) {
  const customer = await Customer.findById(customerId).lean();
  if (!customer) return { sent: false, reason: 'customer_not_found' };

  const phone = customer.whatsapp || customer.phone;
  if (!phone) return { sent: false, reason: 'no_whatsapp_number' };

  const isConnected = await messagingService.isConnected(customer.organizationId, customer.branchId);
  if (!isConnected) return { sent: false, reason: 'not_connected' };

  const balance = Number(customer.balance || 0);
  const text =
    balance > 0
      ? `Hi ${customer.name}, your current outstanding balance is ${balance.toFixed(2)}. Please contact us to settle it.`
      : balance < 0
        ? `Hi ${customer.name}, you have a credit balance of ${Math.abs(balance).toFixed(2)} with us.`
        : `Hi ${customer.name}, your account balance is fully settled. Thank you!`;

  return messagingService.sendText({
    organizationId: customer.organizationId,
    branchId: customer.branchId,
    phone,
    text,
    source: 'ledger',
  });
}

function fireAndForget(promise, label) {
  promise.catch((err) => logger.error(`WhatsApp business notification failed (${label}):`, err));
}

module.exports = {
  sendInvoiceOnCreate,
  sendLedgerUpdate,
  fireAndForget,
};
