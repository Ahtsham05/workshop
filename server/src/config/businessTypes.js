const BUSINESS_TYPES = [
  'retail',
  'wholesale',
  'wholesale_retail',
  'services',
  'restaurant',
  'education',
  'healthcare',
  'other',
  'mobile_shop',
  'pharmacy',
  'factory',
  'school',
];

const BUSINESS_TYPE_ALIASES = {
  mobileshope: 'mobile_shop',
  'mobile shop': 'mobile_shop',
  'mobile-shop': 'mobile_shop',
  'wholesale to retail': 'wholesale_retail',
  'wholesaler to retail': 'wholesale_retail',
  'whole saler to retail': 'wholesale_retail',
  'wholesale-retail': 'wholesale_retail',
  manufacturing: 'factory',
};

const MOBILE_SHOP_BUSINESS_TYPES = ['mobile_shop'];
const SCHOOL_BUSINESS_TYPES = ['school'];

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
  SCHOOL_BUSINESS_TYPES,
  normalizeBusinessType,
};
