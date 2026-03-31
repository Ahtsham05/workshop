const BUSINESS_TYPES = [
  'retail',
  'wholesale',
  'services',
  'restaurant',
  'education',
  'healthcare',
  'other',
  'mobile_shop',
  'pharmacy',
  'factory',
];

const BUSINESS_TYPE_ALIASES = {
  mobileshope: 'mobile_shop',
  'mobile shop': 'mobile_shop',
  'mobile-shop': 'mobile_shop',
  manufacturing: 'factory',
};

const MOBILE_SHOP_BUSINESS_TYPES = ['mobile_shop'];

const normalizeBusinessType = (value) => {
  if (!value) {
    return 'other';
  }

  const normalizedValue = String(value).trim().toLowerCase();
  return BUSINESS_TYPE_ALIASES[normalizedValue] || normalizedValue;
};

module.exports = {
  BUSINESS_TYPES,
  MOBILE_SHOP_BUSINESS_TYPES,
  normalizeBusinessType,
};
