import type { LucideIcon } from 'lucide-react'
import { Ban, Gem, Globe, ListChecks, ShoppingCart } from 'lucide-react'
import type { ProductListPurpose, ProductListRule, ProductListRuleType } from '@/stores/productList.api'

export const PURPOSE_META: Record<ProductListPurpose, { label: string; hint: string; icon: LucideIcon; color: string }> = {
  to_order: { label: 'To order', hint: 'Products to buy next — turn the list into a purchase in one click.', icon: ShoppingCart, color: '#3b82f6' },
  do_not_order: { label: 'Do not order', hint: 'Discontinued or slow items — purchases warn before ordering them.', icon: Ban, color: '#ef4444' },
  online: { label: 'Online', hint: 'Products you sell online / on your website.', icon: Globe, color: '#a855f7' },
  high_value: { label: 'High value', hint: 'The products holding the most money — fills itself from stock value.', icon: Gem, color: '#f59e0b' },
  custom: { label: 'Custom list', hint: 'Any group of products you want to keep together.', icon: ListChecks, color: '#6b7280' },
}

export const PURPOSE_ORDER: ProductListPurpose[] = ['to_order', 'do_not_order', 'online', 'high_value', 'custom']

export const RULE_META: Record<ProductListRuleType, { label: string; hint: string; usesLimit: boolean; usesThreshold: boolean }> = {
  top_stock_value: { label: 'Highest stock value', hint: 'Products holding the most money (stock × cost).', usesLimit: true, usesThreshold: false },
  top_price: { label: 'Highest sale price', hint: 'Your most expensive products.', usesLimit: true, usesThreshold: false },
  low_stock: { label: 'Low stock', hint: "At or below each product's low-stock level (or the number below).", usesLimit: true, usesThreshold: true },
  out_of_stock: { label: 'Out of stock', hint: 'Active products with no stock left.', usesLimit: true, usesThreshold: false },
  inactive_with_stock: { label: 'Inactive but holding stock', hint: 'Switched-off products that still have stock (money stuck).', usesLimit: true, usesThreshold: false },
}

export function describeRule(rule: ProductListRule | null | undefined): string {
  if (!rule) return ''
  const meta = RULE_META[rule.type]
  const top = rule.limit ? `top ${rule.limit}` : ''
  if (rule.type === 'low_stock') return `${meta.label}${rule.threshold != null ? ` (≤ ${rule.threshold} if not set on the product)` : ''} · ${top}`
  return `${meta.label} · ${top}`
}
