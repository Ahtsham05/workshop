/**
 * Standard units of measurement used throughout the application
 */

export const UNITS = {
  // Piece/Count Units
  PCS: 'pcs',
  UNIT: 'unit',
  ITEM: 'item',
  PAIR: 'pair',
  SET: 'set',
  DOZEN: 'dozen',
  
  // Weight Units
  KG: 'kg',
  G: 'g',
  MG: 'mg',
  LB: 'lb',
  OZ: 'oz',
  TON: 'ton',
  
  // Length Units
  M: 'm',
  CM: 'cm',
  MM: 'mm',
  KM: 'km',
  IN: 'in',
  FT: 'ft',
  YD: 'yd',
  
  // Volume/Liquid Units
  L: 'l',
  ML: 'ml',
  GAL: 'gal',
  QT: 'qt',
  PT: 'pt',
  
  // Area Units
  SQM: 'sqm',
  SQFT: 'sqft',
  SQYD: 'sqyd',
  ACRE: 'acre',
  
  // Packaging Units
  BOX: 'box',
  CARTON: 'carton',
  PACK: 'pack',
  BAG: 'bag',
  BOTTLE: 'bottle',
  CAN: 'can',
  JAR: 'jar',
  ROLL: 'roll',
  SHEET: 'sheet',
  BUNDLE: 'bundle',
  
  // Time-based Units
  HOUR: 'hour',
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  YEAR: 'year',
} as const;

export const UNIT_LABELS: Record<string, string> = {
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

export const DEFAULT_UNIT = UNITS.PCS;

export interface UnitOption {
  value: string;
  label: string;
}

export const getAllUnits = (): UnitOption[] => {
  return Object.values(UNITS).map(unit => ({
    value: unit,
    label: UNIT_LABELS[unit] || unit,
  }));
};

export const getUnitLabel = (unit?: string): string => {
  if (!unit) return UNIT_LABELS[DEFAULT_UNIT];
  return UNIT_LABELS[unit] || unit;
};

export const getUnitDisplay = (quantity: number, unit?: string): string => {
  const unitLabel = getUnitLabel(unit);
  return `${quantity} ${unitLabel}`;
};
