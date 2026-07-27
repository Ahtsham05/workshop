const { BUSINESS_TYPES, MOBILE_SHOP_BUSINESS_TYPES } = require('./businessTypes');

// Groups the org-wide business types (server/src/config/businessTypes.js) into the WhatsApp
// template presets the product asks for, without redefining what a "business type" is
// app-wide — organization.businessType remains the single source of truth per client.
const TEMPLATE_GROUPS = {
  SCHOOL: 'school',
  POS_ERP: 'pos_erp',
  MOBILE_SHOP: 'mobile_shop',
  GENERAL: 'general',
};

// mobile_shop gets its own group (below) instead of the generic POS/ERP one, so its
// receipt templates (bill payment, sim sale, repair, etc.) only ever get suggested to
// mobile shop orgs — not to every retail/pharmacy/factory org on the generic preset.
const POS_ERP_BUSINESS_TYPES = ['retail', 'wholesale', 'wholesale_retail', 'pharmacy', 'factory'];

function getTemplateGroup(businessType) {
  if (businessType === 'school' || businessType === 'education') return TEMPLATE_GROUPS.SCHOOL;
  if (MOBILE_SHOP_BUSINESS_TYPES.includes(businessType)) return TEMPLATE_GROUPS.MOBILE_SHOP;
  if (POS_ERP_BUSINESS_TYPES.includes(businessType)) return TEMPLATE_GROUPS.POS_ERP;
  return TEMPLATE_GROUPS.GENERAL;
}

// Shared by both POS_ERP and MOBILE_SHOP groups — mobile shops still raise regular
// invoices/purchase orders/payments alongside their bill-payment/repair/etc. receipts.
const POS_ERP_TEMPLATES = [
  {
      name: 'invoice_ready',
      internalCategory: 'invoice',
      category: 'UTILITY',
      bodyText:
        'Hi {{1}}, your invoice #{{2}} is ready. Amount: Rs {{3}}. Previous balance: Rs {{4}}. Thank you for your business!',
    },
    {
      // Carries the invoice PDF itself as a DOCUMENT header — needed to reach customers
      // outside Meta's 24h customer-service window, where a plain document message is
      // rejected and only an approved template (with the file baked into its header) is
      // allowed. Same internalCategory as invoice_ready so messaging.service.js's
      // window-aware fallback (sendDocumentMessage) picks this up automatically once approved.
      name: 'invoice_pdf',
      internalCategory: 'invoice',
      category: 'UTILITY',
      hasDocumentHeader: true,
      bodyText: 'Hi {{1}}, your invoice #{{2}} is attached. Thank you for your business!',
    },
    {
      name: 'order_update',
      internalCategory: 'order_update',
      category: 'UTILITY',
      bodyText: 'Hi {{1}}, your order #{{2}} status: {{3}}. Thank you for shopping with us!',
    },
    {
      name: 'payment_reminder',
      internalCategory: 'payment_reminder',
      category: 'UTILITY',
      bodyText: 'Dear {{1}}, this is a reminder that you have an outstanding balance of Rs {{2}} with us. Please make the payment at your earliest convenience.',
    },
    {
      // Sent to a customer right after we record a payment from them.
      name: 'payment_received',
      internalCategory: 'payment_received',
      category: 'UTILITY',
      bodyText: 'Dear {{1}}, we have received a payment of Rs {{2}} from you. Your remaining balance is Rs {{3}}. Thank you!',
    },
    {
      // Sent to a supplier right after we record a payment to them.
      name: 'payment_made',
      internalCategory: 'payment_made',
      category: 'UTILITY',
      bodyText: 'Dear {{1}}, we have made a payment of Rs {{2}} to you. Remaining balance: Rs {{3}}. Thank you for your services!',
    },
    {
      // Sent to a supplier when a new purchase order is created — {{3}} carries the
      // flattened "Product A x10, Product B x5" item summary (Meta templates can't loop
      // over an array, so the line items are joined into a single variable).
      name: 'purchase_order',
      internalCategory: 'purchase_order',
      category: 'UTILITY',
      bodyText: 'Hi {{1}}, we have created purchase order #{{2}} with you. Items: {{3}}. Please confirm availability. Thank you!',
    },
    {
      // Goods-handoff receipt for a "pending" (not yet formally billed) invoice — matches
      // buildPendingInvoiceItemsMessageUrdu's SMS wording: item names + qty (no prices) plus
      // who collected them, always in Urdu. {{2}} carries the flattened item summary (Meta
      // templates can't loop over an array) and {{3}} is the receivedByName.
      name: 'pending_invoice',
      internalCategory: 'pending_invoice',
      category: 'UTILITY',
      language: 'ur',
      bodyText: 'نیا زیر التواء آرڈر #{{1}}۔ اشیاء: {{2}}۔ وصول کنندہ: {{3}}۔ شکریہ!',
    },
];

// Receipt templates for the Mobile Shop module's own tabs (bill payments, sim sale, load,
// repair, services, installments) — internalCategory values match the templateCategory
// props wired into each tab's WhatsAppSendButton.
const MOBILE_SHOP_TEMPLATES = [
  {
    // Covers both the Bills and Agent Bill Records tables — same receipt shape.
    name: 'bill_payment_receipt',
    internalCategory: 'bill_payment_receipt',
    category: 'UTILITY',
    bodyText: 'Dear {{1}}, your {{2}} bill payment of Rs {{3}} (Ref #{{4}}) has been received. Thank you!',
  },
  {
    name: 'service_receipt',
    internalCategory: 'service_receipt',
    category: 'UTILITY',
    bodyText: 'Dear {{1}}, your service invoice #{{2}} for Rs {{3}} has been recorded. Thank you for your business!',
  },
  {
    name: 'sim_sale_receipt',
    internalCategory: 'sim_sale_receipt',
    category: 'UTILITY',
    bodyText: 'Dear {{1}}, thank you for your {{2}} purchase (Job #{{3}}) worth Rs {{4}}. Visit us again!',
  },
  {
    name: 'load_sale_receipt',
    internalCategory: 'load_sale_receipt',
    category: 'UTILITY',
    bodyText: 'Dear {{1}}, Rs {{2}} {{3}} load has been sent to {{4}}. Thank you!',
  },
  {
    name: 'cash_transaction_receipt',
    internalCategory: 'cash_transaction_receipt',
    category: 'UTILITY',
    bodyText: 'Dear {{1}}, your {{2}} transaction of Rs {{3}} has been completed. Thank you!',
  },
  {
    name: 'repair_receipt',
    internalCategory: 'repair_receipt',
    category: 'UTILITY',
    bodyText: 'Dear {{1}}, your {{2}} repair job is now {{3}}. Balance due: Rs {{4}}. Thank you!',
  },
  {
    name: 'installment_receipt',
    internalCategory: 'installment_receipt',
    category: 'UTILITY',
    bodyText: 'Dear {{1}}, installment plan {{2}} has an outstanding balance of Rs {{3}} ({{4}}/{{5}} paid). Thank you!',
  },
];

const DEFAULT_TEMPLATES_BY_GROUP = {
  [TEMPLATE_GROUPS.SCHOOL]: [
    {
      name: 'fee_reminder',
      internalCategory: 'fee',
      category: 'UTILITY',
      bodyText: 'Dear parent of {{1}}, fee for {{2}} is due on {{3}}. Please pay on time.',
    },
  ],
  [TEMPLATE_GROUPS.POS_ERP]: POS_ERP_TEMPLATES,
  [TEMPLATE_GROUPS.MOBILE_SHOP]: [...POS_ERP_TEMPLATES, ...MOBILE_SHOP_TEMPLATES],
  [TEMPLATE_GROUPS.GENERAL]: [
    {
      name: 'payment_reminder',
      internalCategory: 'payment_reminder',
      category: 'UTILITY',
      bodyText: 'Hi {{1}}, your payment of Rs {{2}} for {{3}} is due.',
    },
    {
      name: 'payment_received',
      internalCategory: 'payment_received',
      category: 'UTILITY',
      bodyText: 'Dear {{1}}, we have received a payment of Rs {{2}} from you. Your remaining balance is Rs {{3}}. Thank you!',
    },
    {
      name: 'payment_made',
      internalCategory: 'payment_made',
      category: 'UTILITY',
      bodyText: 'Dear {{1}}, we have made a payment of Rs {{2}} to you. Remaining balance: Rs {{3}}. Thank you for your services!',
    },
  ],
};

function countVariables(bodyText) {
  const matches = String(bodyText || '').match(/\{\{\s*\d+\s*\}\}/g);
  return matches ? new Set(matches).size : 0;
}

function getSuggestedTemplates(businessType) {
  const group = getTemplateGroup(businessType);
  const list = DEFAULT_TEMPLATES_BY_GROUP[group] || [];
  return list.map((t) => ({ ...t, language: t.language || 'en', variableCount: countVariables(t.bodyText) }));
}

module.exports = {
  BUSINESS_TYPES,
  TEMPLATE_GROUPS,
  getTemplateGroup,
  getSuggestedTemplates,
  countVariables,
};
