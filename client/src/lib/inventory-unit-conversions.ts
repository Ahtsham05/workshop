import { DEFAULT_UNIT, getUnitLabel } from '@/lib/units'

export interface ProductUnitConversion {
  fromUnit: string
  toUnit: string
  factor: number
  businessTypes?: string[]
  isActive?: boolean
}

export interface ConvertibleProduct {
  unit?: string
  unitConversions?: ProductUnitConversion[]
  cost?: number
  price?: number
  stockQuantity?: number
}

export interface ResolvedUnitConversion {
  lineUnit: string
  stockUnit: string
  conversionFactor: number
  stockQuantity: number
  hasPresetRule: boolean
}

const roundQuantity = (value: number, precision = 6) => Number(value.toFixed(precision))

export const normalizeUnit = (unit?: string | null) => (unit || DEFAULT_UNIT).trim().toLowerCase()

export const getProductConversionRules = (product?: ConvertibleProduct | null) => {
  return (product?.unitConversions || []).filter((rule) => rule && rule.isActive !== false)
}

export const getPresetConversionFactor = (product: ConvertibleProduct | null | undefined, fromUnit?: string | null) => {
  const stockUnit = normalizeUnit(product?.unit)
  const lineUnit = normalizeUnit(fromUnit,)

  if (lineUnit === stockUnit) {
    return 1
  }

  const matchingRule = getProductConversionRules(product).find(
    (rule) => normalizeUnit(rule.fromUnit) === lineUnit && normalizeUnit(rule.toUnit) === stockUnit
  )

  return matchingRule?.factor ? Number(matchingRule.factor) : null
}

export const getProductUnitOptions = (product?: ConvertibleProduct | null) => {
  const stockUnit = normalizeUnit(product?.unit)
  const options = new Map<string, { value: string; label: string; factor?: number }>()

  options.set(stockUnit, {
    value: stockUnit,
    label: getUnitLabel(stockUnit),
    factor: 1,
  })

  getProductConversionRules(product).forEach((rule) => {
    if (normalizeUnit(rule.toUnit) !== stockUnit) {
      return
    }

    const fromUnit = normalizeUnit(rule.fromUnit)
    if (!options.has(fromUnit)) {
      options.set(fromUnit, {
        value: fromUnit,
        label: getUnitLabel(fromUnit),
        factor: Number(rule.factor),
      })
    }
  })

  return Array.from(options.values())
}

export const resolveUnitConversion = ({
  product,
  quantity,
  unit,
  conversionFactor,
}: {
  product: ConvertibleProduct
  quantity: number
  unit?: string | null
  conversionFactor?: number | null
}): ResolvedUnitConversion | null => {
  const safeQuantity = Number(quantity || 0)
  if (!Number.isFinite(safeQuantity) || safeQuantity <= 0) {
    return null
  }

  const stockUnit = normalizeUnit(product.unit)
  const lineUnit = normalizeUnit(unit || product.unit)

  if (lineUnit === stockUnit) {
    return {
      lineUnit,
      stockUnit,
      conversionFactor: 1,
      stockQuantity: safeQuantity,
      hasPresetRule: true,
    }
  }

  const presetFactor = getPresetConversionFactor(product, lineUnit)
  const finalFactor = Number(conversionFactor || 0) > 0 ? Number(conversionFactor) : presetFactor

  if (!finalFactor || finalFactor <= 0) {
    return null
  }

  return {
    lineUnit,
    stockUnit,
    conversionFactor: finalFactor,
    stockQuantity: roundQuantity(safeQuantity * finalFactor),
    hasPresetRule: Boolean(presetFactor),
  }
}

export const calculateInvoiceLineValues = ({
  product,
  quantity,
  unit,
  unitPrice,
  cost,
  conversionFactor,
}: {
  product: ConvertibleProduct
  quantity: number
  unit?: string | null
  unitPrice: number
  cost: number
  conversionFactor?: number | null
}) => {
  const resolved = resolveUnitConversion({ product, quantity, unit, conversionFactor })
  if (!resolved) {
    return null
  }

  const subtotal = Number(quantity || 0) * Number(unitPrice || 0)
  const totalCost = resolved.stockQuantity * Number(cost || 0)

  return {
    ...resolved,
    subtotal,
    totalCost,
    profit: subtotal - totalCost,
  }
}

export const getUnitAdjustedPrice = ({
  product,
  unit,
  basePrice,
  conversionFactor,
}: {
  product: ConvertibleProduct
  unit?: string | null
  basePrice: number
  conversionFactor?: number | null
}) => {
  const resolved = resolveUnitConversion({
    product,
    quantity: 1,
    unit,
    conversionFactor,
  })

  if (!resolved) {
    return null
  }

  return Number(basePrice || 0) * resolved.conversionFactor
}
