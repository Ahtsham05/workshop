/**
 * Standard units of measurement used throughout the application
 */

const UNITS = {
  // Piece/Count Units
  PCS: 'pcs',           // Pieces (default)
  UNIT: 'unit',         // Unit
  ITEM: 'item',         // Item
  PAIR: 'pair',         // Pair
  SET: 'set',           // Set
  DOZEN: 'dozen',       // Dozen (12 pieces)
  
  // Weight Units
  KG: 'kg',             // Kilogram
  G: 'g',               // Gram
  MG: 'mg',             // Milligram
  LB: 'lb',             // Pound
  OZ: 'oz',             // Ounce
  TON: 'ton',           // Metric Ton
  
  // Length Units
  M: 'm',               // Meter
  CM: 'cm',             // Centimeter
  MM: 'mm',             // Millimeter
  KM: 'km',             // Kilometer
  IN: 'in',             // Inch
  FT: 'ft',             // Foot
  YD: 'yd',             // Yard
  
  // Volume/Liquid Units
  L: 'l',               // Liter
  ML: 'ml',             // Milliliter
  GAL: 'gal',           // Gallon
  QT: 'qt',             // Quart
  PT: 'pt',             // Pint
  
  // Area Units
  SQM: 'sqm',           // Square Meter
  SQFT: 'sqft',         // Square Foot
  SQYD: 'sqyd',         // Square Yard
  ACRE: 'acre',         // Acre
  
  // Packaging Units
  BOX: 'box',           // Box
  CARTON: 'carton',     // Carton
  PACK: 'pack',         // Pack
  BAG: 'bag',           // Bag
  BOTTLE: 'bottle',     // Bottle
  CAN: 'can',           // Can
  JAR: 'jar',           // Jar
  ROLL: 'roll',         // Roll
  SHEET: 'sheet',       // Sheet
  BUNDLE: 'bundle',     // Bundle
  
  // Time-based Units (for services/rentals)
  HOUR: 'hour',         // Hour
  DAY: 'day',           // Day
  WEEK: 'week',         // Week
  MONTH: 'month',       // Month
  YEAR: 'year',         // Year
};

// Unit display names with translations support
const UNIT_LABELS = {
  [UNITS.PCS]: 'Pieces',
  [UNITS.UNIT]: 'Unit',
  [UNITS.ITEM]: 'Item',
  [UNITS.PAIR]: 'Pair',
  [UNITS.SET]: 'Set',
  [UNITS.DOZEN]: 'Dozen',
  
  [UNITS.KG]: 'Kilogram',
  [UNITS.G]: 'Gram',
  [UNITS.MG]: 'Milligram',
  [UNITS.LB]: 'Pound',
  [UNITS.OZ]: 'Ounce',
  [UNITS.TON]: 'Metric Ton',
  
  [UNITS.M]: 'Meter',
  [UNITS.CM]: 'Centimeter',
  [UNITS.MM]: 'Millimeter',
  [UNITS.KM]: 'Kilometer',
  [UNITS.IN]: 'Inch',
  [UNITS.FT]: 'Foot',
  [UNITS.YD]: 'Yard',
  
  [UNITS.L]: 'Liter',
  [UNITS.ML]: 'Milliliter',
  [UNITS.GAL]: 'Gallon',
  [UNITS.QT]: 'Quart',
  [UNITS.PT]: 'Pint',
  
  [UNITS.SQM]: 'Square Meter',
  [UNITS.SQFT]: 'Square Foot',
  [UNITS.SQYD]: 'Square Yard',
  [UNITS.ACRE]: 'Acre',
  
  [UNITS.BOX]: 'Box',
  [UNITS.CARTON]: 'Carton',
  [UNITS.PACK]: 'Pack',
  [UNITS.BAG]: 'Bag',
  [UNITS.BOTTLE]: 'Bottle',
  [UNITS.CAN]: 'Can',
  [UNITS.JAR]: 'Jar',
  [UNITS.ROLL]: 'Roll',
  [UNITS.SHEET]: 'Sheet',
  [UNITS.BUNDLE]: 'Bundle',
  
  [UNITS.HOUR]: 'Hour',
  [UNITS.DAY]: 'Day',
  [UNITS.WEEK]: 'Week',
  [UNITS.MONTH]: 'Month',
  [UNITS.YEAR]: 'Year',
};

// Default unit
const DEFAULT_UNIT = UNITS.PCS;

// Get all units as array for dropdown
const getAllUnits = () => {
  return Object.values(UNITS);
};

// Get unit label
const getUnitLabel = (unit) => {
  return UNIT_LABELS[unit] || unit;
};

module.exports = {
  UNITS,
  UNIT_LABELS,
  DEFAULT_UNIT,
  getAllUnits,
  getUnitLabel,
};
