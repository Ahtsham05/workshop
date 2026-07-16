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
      bodyText: 'Dear parent of {{1}}, fee for {{2}} is due on {{3}}.',
    },
  ],
  [TEMPLATE_GROUPS.POS_ERP]: [
    {
      name: 'invoice_ready',
      internalCategory: 'invoice',
      category: 'UTILITY',
      bodyText: 'Hi {{1}}, your invoice #{{2}} is ready. Amount: Rs {{3}}. Previous balance: Rs {{4}}.',
    },
    {
      name: 'order_update',
      internalCategory: 'order_update',
      category: 'UTILITY',
      bodyText: 'Hi {{1}}, your order #{{2}} status: {{3}}.',
    },
  ],
  [TEMPLATE_GROUPS.GENERAL]: [
    {
      name: 'payment_reminder',
      internalCategory: 'payment_reminder',
      category: 'UTILITY',
      bodyText: 'Hi {{1}}, your payment of Rs {{2}} for {{3}} is due.',
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
