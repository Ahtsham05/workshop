const { BUSINESS_TYPES } = require('./businessTypes');

// Groups the org-wide business types (server/src/config/businessTypes.js) into the three
// WhatsApp template presets the product asks for, without redefining what a "business type"
// is app-wide — organization.businessType remains the single source of truth per client.
const TEMPLATE_GROUPS = {
  SCHOOL: 'school',
  POS_ERP: 'pos_erp',
  GENERAL: 'general',
};

const POS_ERP_BUSINESS_TYPES = ['retail', 'wholesale', 'wholesale_retail', 'mobile_shop', 'pharmacy', 'factory'];

function getTemplateGroup(businessType) {
  if (businessType === 'school' || businessType === 'education') return TEMPLATE_GROUPS.SCHOOL;
  if (POS_ERP_BUSINESS_TYPES.includes(businessType)) return TEMPLATE_GROUPS.POS_ERP;
  return TEMPLATE_GROUPS.GENERAL;
}

const DEFAULT_TEMPLATES_BY_GROUP = {
  [TEMPLATE_GROUPS.SCHOOL]: [
    {
      name: 'fee_reminder',
      internalCategory: 'fee',
      category: 'UTILITY',
      bodyText: 'Dear parent of {{1}}, fee for {{2}} is due on {{3}}. Please pay on time.',
    },
  ],
  [TEMPLATE_GROUPS.POS_ERP]: [
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
  ],
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
  return list.map((t) => ({ ...t, language: 'en', variableCount: countVariables(t.bodyText) }));
}

module.exports = {
  BUSINESS_TYPES,
  TEMPLATE_GROUPS,
  getTemplateGroup,
  getSuggestedTemplates,
  countVariables,
};
