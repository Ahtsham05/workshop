/**
 * Pricing rules for the Price Update Center — pure functions, no React, no I/O.
 *
 * A supplier's price list gives a new COST (or sometimes a selling price). Turning that into
 * "what should we now sell it for" is a policy decision that differs per shop and per moment, so
 * it is an explicit, visible rule the user picks — and it is recomputed instantly over every row
 * whenever the rule changes, which is why it lives here on the client instead of behind a request.
 *
 * "Margin %" throughout means markup on cost — `price = cost × (1 + margin/100)` — because that
 * is what the rest of this app calls margin (see MarkupPercentInput in the product form).
 */

export type ListType = 'cost' | 'price' | 'cost_price' | 'price_cost'

export type PriceStrategy =
  | 'keep_margin_percent' // same % markup as today
  | 'keep_margin_amount' // same rupee profit as today
  | 'fixed_margin_percent' // a set % markup over the new cost
  | 'from_list' // the list's own selling-price column
  | 'keep_price' // leave selling prices alone (cost-only update)

export type RoundStep = 0 | 1 | 5 | 10 | 50 | 100
export type RoundDirection = 'nearest' | 'up' | 'down'

export interface PricingRule {
  strategy: PriceStrategy
  /** Used by 'fixed_margin_percent', and as the fallback when a product has no margin history. */
  fixedMarginPercent: number
  roundStep: RoundStep
  roundDirection: RoundDirection
  /**
   * Opt-in floor: never end up selling for less than cost × (1 + this/100). 0 = off — a price
   * below cost is then never rewritten silently, it is flagged 'below_cost' for the user to see.
   */
  minMarginPercent: number
  /** When cost falls, keep the current selling price instead of lowering it. */
  neverLowerPrice: boolean
}

export const DEFAULT_RULE: PricingRule = {
  strategy: 'keep_margin_percent',
  fixedMarginPercent: 15,
  roundStep: 1,
  roundDirection: 'nearest',
  minMarginPercent: 0,
  neverLowerPrice: false,
}

export interface ListValue {
  value: number
  kind: 'cost' | 'price' | null
}

/** A change this large in one step is more likely a typo, a pack price or a wrong match. */
export const BIG_CHANGE_PERCENT = 25

const round2 = (n: number) => Math.round(n * 100) / 100
const EPS = 1e-9

export function roundPrice(value: number, step: RoundStep, direction: RoundDirection): number {
  if (!Number.isFinite(value)) return value
  if (step <= 0) return round2(value)
  const q = value / step
  const n = direction === 'up' ? Math.ceil(q - EPS) : direction === 'down' ? Math.floor(q + EPS) : Math.round(q)
  return round2(n * step)
}

/** Markup on cost, in %. null when there is no cost to measure against. */
export function marginPercent(cost: number, price: number): number | null {
  return cost > 0 ? round2(((price - cost) / cost) * 100) : null
}

export function changePercent(from: number, to: number): number | null {
  return from > 0 ? round2(((to - from) / from) * 100) : null
}

/**
 * Reads a row's cost and selling price out of the numbers the list gave for it.
 *
 * Numbers the list itself LABELLED ("DP 31000  RP 33999", a "Dealer | Retail" header) are trusted
 * over the user's list-type choice; only unlabelled numbers are assigned by position.
 */
export function resolveListValues(values: ListValue[], listType: ListType): { cost?: number; price?: number } {
  const out: { cost?: number; price?: number } = {}
  values.forEach((v) => {
    if (v.kind === 'cost' && out.cost === undefined) out.cost = v.value
    if (v.kind === 'price' && out.price === undefined) out.price = v.value
  })
  const order: Array<'cost' | 'price'> =
    listType === 'cost' ? ['cost'] : listType === 'price' ? ['price'] : listType === 'cost_price' ? ['cost', 'price'] : ['price', 'cost']
  const unlabelled = values.filter((v) => !v.kind)
  let next = 0
  order.forEach((target) => {
    if (out[target] === undefined && unlabelled[next]) {
      out[target] = unlabelled[next].value
      next += 1
    }
  })
  return out
}

export type ProposalNote =
  | 'no_cost_history' // no old cost/price to keep a margin from — the fixed % was used
  | 'raised_to_min_margin' // the minimum-margin guard raised the price
  | 'kept_higher_price' // "never lower prices" kept today's price
  | 'list_price_missing' // "use the list's price" but this line had none

export interface Proposal {
  newCost?: number
  newPrice?: number
  notes: ProposalNote[]
}

interface ProposalInput {
  oldCost: number
  oldPrice: number
  /** What the list gives for this line, after any manual override of the cost. */
  list: { cost?: number; price?: number }
}

/** The selling price a rule suggests for one product. `undefined` = leave the price alone. */
export function computeProposal(input: ProposalInput, rule: PricingRule): Proposal {
  const { oldCost, oldPrice, list } = input
  const notes: ProposalNote[] = []
  const out: Proposal = { notes }
  if (list.cost !== undefined) out.newCost = round2(list.cost)

  // A selling-price-only list: the list IS the new selling price, cost is untouched.
  if (list.cost === undefined) {
    if (list.price !== undefined) out.newPrice = round2(list.price)
    return out
  }

  const newCost = out.newCost as number
  let raw: number | undefined

  switch (rule.strategy) {
    case 'keep_price':
      raw = undefined
      break
    case 'from_list':
      if (list.price !== undefined) raw = list.price
      else notes.push('list_price_missing')
      break
    case 'fixed_margin_percent':
      raw = newCost * (1 + rule.fixedMarginPercent / 100)
      break
    case 'keep_margin_amount':
      if (oldCost > 0 && oldPrice > 0) raw = oldPrice + (newCost - oldCost)
      else {
        raw = newCost * (1 + rule.fixedMarginPercent / 100)
        notes.push('no_cost_history')
      }
      break
    case 'keep_margin_percent':
    default:
      if (oldCost > 0 && oldPrice > 0) raw = newCost * (oldPrice / oldCost)
      else {
        raw = newCost * (1 + rule.fixedMarginPercent / 100)
        notes.push('no_cost_history')
      }
      break
  }

  if (raw === undefined) return out

  // The list's own selling price is the supplier's word, not a computation — not rounded.
  let price = rule.strategy === 'from_list' && list.price !== undefined ? round2(raw) : roundPrice(raw, rule.roundStep, rule.roundDirection)

  if (rule.neverLowerPrice && oldPrice > 0 && price < oldPrice) {
    price = oldPrice
    notes.push('kept_higher_price')
  }

  // The minimum-margin guard is applied last: it wins over "never lower". Only when the user
  // turned it on — otherwise a below-cost result (usually a mis-mapped list column) is flagged by
  // computeRow instead of being quietly "fixed" into a plausible-looking number.
  const minMargin = Math.max(0, rule.minMarginPercent)
  const floor = newCost * (1 + minMargin / 100)
  if (minMargin > 0 && newCost > 0 && price < floor - EPS) {
    price = roundPrice(floor, rule.roundStep, 'up')
    notes.push('raised_to_min_margin')
  }

  out.newPrice = price
  return out
}

export type RowFlag =
  | 'below_cost' // the resulting selling price is under the resulting cost
  | 'big_cost_change'
  | 'big_price_change'
  | 'no_price_set' // the product has no selling price today

export interface RowOverrides {
  cost?: number | null
  price?: number | null
}

export interface RowComputation {
  /** undefined = this update leaves the value alone */
  newCost?: number
  newPrice?: number
  costChanged: boolean
  priceChanged: boolean
  costPercent: number | null
  pricePercent: number | null
  /** Margin (markup on cost, %) before and after — measured on the values the product will hold. */
  oldMargin: number | null
  newMargin: number | null
  notes: ProposalNote[]
  flags: RowFlag[]
}

const SAME = 0.005

/**
 * Everything the review grid shows for one matched line, from the product's current numbers, the
 * list's numbers, the rule, and any per-line manual overrides (which always win).
 */
export function computeRow(
  entry: { cost: number; price: number },
  listValues: ListValue[],
  listType: ListType,
  rule: PricingRule,
  overrides: RowOverrides = {},
): RowComputation {
  const list = resolveListValues(listValues, listType)
  if (overrides.cost !== undefined && overrides.cost !== null) list.cost = overrides.cost

  const proposal = computeProposal({ oldCost: entry.cost, oldPrice: entry.price, list }, rule)
  const newCost = proposal.newCost
  let newPrice = proposal.newPrice
  if (overrides.price !== undefined && overrides.price !== null) newPrice = round2(overrides.price)

  const costChanged = newCost !== undefined && Math.abs(newCost - entry.cost) >= SAME
  const priceChanged = newPrice !== undefined && Math.abs(newPrice - entry.price) >= SAME
  const effectiveCost = newCost !== undefined ? newCost : entry.cost
  const effectivePrice = newPrice !== undefined ? newPrice : entry.price

  const costPercent = costChanged && newCost !== undefined ? changePercent(entry.cost, newCost) : null
  const pricePercent = priceChanged && newPrice !== undefined ? changePercent(entry.price, newPrice) : null

  const flags: RowFlag[] = []
  if (effectivePrice > 0 && effectiveCost > 0 && effectivePrice < effectiveCost - SAME) flags.push('below_cost')
  if (costPercent !== null && Math.abs(costPercent) >= BIG_CHANGE_PERCENT) flags.push('big_cost_change')
  if (pricePercent !== null && Math.abs(pricePercent) >= BIG_CHANGE_PERCENT) flags.push('big_price_change')
  if (entry.price <= 0 && newPrice === undefined) flags.push('no_price_set')

  return {
    newCost,
    newPrice,
    costChanged,
    priceChanged,
    costPercent,
    pricePercent,
    oldMargin: marginPercent(entry.cost, entry.price),
    newMargin: marginPercent(effectiveCost, effectivePrice),
    notes: proposal.notes,
    flags,
  }
}

/** Do two rules produce identical proposals? (Used to avoid pointless recomputation.) */
export function sameRule(a: PricingRule, b: PricingRule): boolean {
  return (
    a.strategy === b.strategy &&
    a.fixedMarginPercent === b.fixedMarginPercent &&
    a.roundStep === b.roundStep &&
    a.roundDirection === b.roundDirection &&
    a.minMarginPercent === b.minMarginPercent &&
    a.neverLowerPrice === b.neverLowerPrice
  )
}
