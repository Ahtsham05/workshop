/**
 * Pure business formulas behind the calculator's tools. Every function takes plain numbers
 * and returns plain numbers (or null when the inputs don't determine an answer), so they
 * can be checked without rendering anything.
 *
 *   margin  = profit ÷ selling price   (what you keep out of every sale)
 *   markup  = profit ÷ cost            (what you add on top of cost)
 *
 * The two are the most commonly confused numbers at a counter — a 25% markup is only a
 * 20% margin — so the margin tool always shows both side by side.
 */

import { roundFloat } from './expression'

const r = roundFloat
/** A running balance that should end at 0 but carries float dust (1e-10) after the last payment. */
const settle = (balance: number) => (Math.abs(balance) < 0.005 ? 0 : r(Math.max(0, balance)))

/* ── Margin & markup ─────────────────────────────────────────────────────── */

export type PricingField = 'price' | 'margin' | 'markup' | 'profit'

export interface PricingResult {
  cost: number
  price: number
  profit: number
  /** % of the selling price. null when the price is 0. */
  margin: number | null
  /** % of the cost. null when the cost is 0. */
  markup: number | null
}

/**
 * Cost plus any ONE of selling price / margin % / markup % / profit amount → the rest.
 * Returns null when the combination is impossible (e.g. a margin of 100% or more).
 */
export function solvePricing(cost: number, field: PricingField, value: number): PricingResult | null {
  if (!Number.isFinite(cost) || !Number.isFinite(value)) return null
  let price: number
  switch (field) {
    case 'price':
      price = value
      break
    case 'profit':
      price = cost + value
      break
    case 'markup':
      price = cost * (1 + value / 100)
      break
    case 'margin':
      if (value >= 100) return null
      price = cost / (1 - value / 100)
      break
  }
  const profit = price - cost
  return {
    cost: r(cost),
    price: r(price),
    profit: r(profit),
    margin: price !== 0 ? r((profit / price) * 100) : null,
    markup: cost !== 0 ? r((profit / cost) * 100) : null,
  }
}

export const marginToMarkup = (margin: number): number | null => (margin >= 100 ? null : r((margin / (100 - margin)) * 100))
export const markupToMargin = (markup: number): number | null => (markup <= -100 ? null : r((markup / (100 + markup)) * 100))

/* ── Discount ────────────────────────────────────────────────────────────── */

export interface DiscountResult {
  original: number
  final: number
  saved: number
  /** Overall % off (for chained discounts this is NOT the sum of the steps). */
  percent: number | null
}

/** Applies one or more successive percentage discounts (e.g. 10% then 5%). */
export function applyDiscounts(original: number, percents: number[]): DiscountResult {
  const final = percents.reduce((amount, pct) => amount * (1 - pct / 100), original)
  return {
    original: r(original),
    final: r(final),
    saved: r(original - final),
    percent: original !== 0 ? r(((original - final) / original) * 100) : null,
  }
}

/** A flat amount off. */
export function applyDiscountAmount(original: number, amount: number): DiscountResult {
  const final = original - amount
  return {
    original: r(original),
    final: r(final),
    saved: r(amount),
    percent: original !== 0 ? r((amount / original) * 100) : null,
  }
}

/** "It was 1,500 and they paid 1,275 — how much % off was that?" */
export function discountBetween(original: number, final: number): DiscountResult {
  return applyDiscountAmount(original, original - final)
}

/* ── Tax (GST / VAT / sales tax) ─────────────────────────────────────────── */

export interface TaxResult {
  net: number
  tax: number
  gross: number
}

/** Price is before tax → add the tax on top. */
export const addTax = (net: number, rate: number): TaxResult => {
  const tax = (net * rate) / 100
  return { net: r(net), tax: r(tax), gross: r(net + tax) }
}

/** Price already includes the tax → pull the tax back out of it. */
export const removeTax = (gross: number, rate: number): TaxResult | null => {
  if (rate <= -100) return null
  const net = gross / (1 + rate / 100)
  return { net: r(net), tax: r(gross - net), gross: r(gross) }
}

/* ── Percentages ─────────────────────────────────────────────────────────── */

export const percentOf = (pct: number, base: number): number => r((pct / 100) * base)
export const whatPercent = (part: number, whole: number): number | null => (whole === 0 ? null : r((part / whole) * 100))
export const percentChange = (from: number, to: number): number | null => (from === 0 ? null : r(((to - from) / Math.abs(from)) * 100))
export const changeByPercent = (base: number, pct: number): number => r(base * (1 + pct / 100))

/* ── Installments ────────────────────────────────────────────────────────── */

export type InstallmentMethod = 'flat' | 'reducing'

export interface InstallmentInput {
  /** Cash price of the item. */
  price: number
  /** Paid at handover. */
  advance: number
  months: number
  /**
   * flat:     markup % charged once on the amount financed (how most shops quote it:
   *           "20% extra over 10 months").
   * reducing: yearly interest rate on the remaining balance (bank-style EMI).
   */
  rate: number
  method: InstallmentMethod
}

export interface InstallmentRow {
  month: number
  payment: number
  principal: number
  profit: number
  balance: number
}

export interface InstallmentResult {
  financed: number
  monthly: number
  totalProfit: number
  /** Advance + every monthly payment. */
  totalPayable: number
  /** totalPayable over the cash price, as a %. */
  effectiveIncrease: number | null
  schedule: InstallmentRow[]
}

export function planInstallments(input: InstallmentInput): InstallmentResult | null {
  const { price, advance, rate, method } = input
  const months = Math.floor(input.months)
  if (!(months >= 1) || months > 600 || price < 0 || advance < 0 || advance > price) return null
  const financed = price - advance
  const schedule: InstallmentRow[] = []

  if (method === 'flat') {
    const totalProfit = (financed * rate) / 100
    const monthly = (financed + totalProfit) / months
    let balance = financed + totalProfit
    for (let m = 1; m <= months; m++) {
      balance -= monthly
      schedule.push({
        month: m,
        payment: r(monthly),
        principal: r(financed / months),
        profit: r(totalProfit / months),
        balance: settle(balance),
      })
    }
    const totalPayable = advance + financed + totalProfit
    return {
      financed: r(financed),
      monthly: r(monthly),
      totalProfit: r(totalProfit),
      totalPayable: r(totalPayable),
      effectiveIncrease: price ? r(((totalPayable - price) / price) * 100) : null,
      schedule,
    }
  }

  const monthlyRate = rate / 12 / 100
  const monthly = monthlyRate === 0 ? financed / months : (financed * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months))
  let balance = financed
  let totalProfit = 0
  for (let m = 1; m <= months; m++) {
    const profit = balance * monthlyRate
    const principal = monthly - profit
    balance -= principal
    totalProfit += profit
    schedule.push({ month: m, payment: r(monthly), principal: r(principal), profit: r(profit), balance: settle(balance) })
  }
  const totalPayable = advance + monthly * months
  return {
    financed: r(financed),
    monthly: r(monthly),
    totalProfit: r(totalProfit),
    totalPayable: r(totalPayable),
    effectiveIncrease: price ? r(((totalPayable - price) / price) * 100) : null,
    schedule,
  }
}

/* ── Break-even ──────────────────────────────────────────────────────────── */

export interface BreakEvenResult {
  /** Profit each unit contributes towards fixed costs. */
  contribution: number
  contributionRatio: number | null
  /** Units to sell to cover fixed costs (+ the target profit), rounded up. */
  units: number | null
  revenue: number | null
}

export function breakEven(fixedCosts: number, pricePerUnit: number, variableCostPerUnit: number, targetProfit = 0): BreakEvenResult {
  const contribution = pricePerUnit - variableCostPerUnit
  if (contribution <= 0) {
    return { contribution: r(contribution), contributionRatio: pricePerUnit ? r((contribution / pricePerUnit) * 100) : null, units: null, revenue: null }
  }
  const exact = (fixedCosts + targetProfit) / contribution
  const units = Math.ceil(r(exact))
  return {
    contribution: r(contribution),
    contributionRatio: pricePerUnit ? r((contribution / pricePerUnit) * 100) : null,
    units,
    revenue: r(units * pricePerUnit),
  }
}

/* ── Unit / landed cost ──────────────────────────────────────────────────── */

export interface UnitCostResult {
  totalCost: number
  unitCost: number | null
}

/** A carton/lot price plus freight & other charges, spread over the pieces it holds. */
export function unitCost(lotPrice: number, extraCharges: number, pieces: number): UnitCostResult {
  const totalCost = lotPrice + extraCharges
  return { totalCost: r(totalCost), unitCost: pieces > 0 ? r(totalCost / pieces) : null }
}
