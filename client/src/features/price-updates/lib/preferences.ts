import { DEFAULT_RULE, type ListType, type PricingRule } from '@/lib/price-update-rules'

// Per-browser conveniences only: the last rule and list type used are remembered so a shop that
// updates from the same supplier every week doesn't re-enter them. Every read/write is guarded —
// storage can throw (private windows, blocked site data) and the page must work without it.
const RULE_KEY = 'priceUpdateRule'
const LIST_TYPE_KEY = 'priceUpdateListType'

const LIST_TYPES: ListType[] = ['cost', 'price', 'cost_price', 'price_cost']

export function loadRule(): PricingRule {
  try {
    const raw = localStorage.getItem(RULE_KEY)
    if (!raw) return DEFAULT_RULE
    const parsed = JSON.parse(raw) as Partial<PricingRule>
    return {
      strategy: ['keep_margin_percent', 'keep_margin_amount', 'fixed_margin_percent', 'from_list', 'keep_price'].includes(String(parsed.strategy))
        ? (parsed.strategy as PricingRule['strategy'])
        : DEFAULT_RULE.strategy,
      fixedMarginPercent: Number.isFinite(parsed.fixedMarginPercent) ? Number(parsed.fixedMarginPercent) : DEFAULT_RULE.fixedMarginPercent,
      roundStep: [0, 1, 5, 10, 50, 100].includes(Number(parsed.roundStep)) ? (Number(parsed.roundStep) as PricingRule['roundStep']) : DEFAULT_RULE.roundStep,
      roundDirection: ['nearest', 'up', 'down'].includes(String(parsed.roundDirection)) ? (parsed.roundDirection as PricingRule['roundDirection']) : DEFAULT_RULE.roundDirection,
      minMarginPercent: Number.isFinite(parsed.minMarginPercent) ? Math.max(0, Number(parsed.minMarginPercent)) : DEFAULT_RULE.minMarginPercent,
      neverLowerPrice: Boolean(parsed.neverLowerPrice),
    }
  } catch {
    return DEFAULT_RULE
  }
}

export function saveRule(rule: PricingRule): void {
  try {
    localStorage.setItem(RULE_KEY, JSON.stringify(rule))
  } catch {
    /* not persisted — fine */
  }
}

export function loadListType(): ListType | null {
  try {
    const raw = localStorage.getItem(LIST_TYPE_KEY)
    return LIST_TYPES.includes(raw as ListType) ? (raw as ListType) : null
  } catch {
    return null
  }
}

export function saveListType(type: ListType): void {
  try {
    localStorage.setItem(LIST_TYPE_KEY, type)
  } catch {
    /* not persisted — fine */
  }
}
