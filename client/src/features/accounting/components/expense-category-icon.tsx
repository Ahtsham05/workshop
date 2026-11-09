/**
 * Icon tile for an expense category — picked from the category's name (Rent → house,
 * Utilities → bolt, Freight → truck…) and tinted with the category's own colour, so a list
 * of categories reads at a glance without anyone having to choose icons.
 */

import type { LucideIcon } from 'lucide-react'
import {
  Building2,
  Car,
  Coffee,
  Factory,
  Fuel,
  Hammer,
  HandCoins,
  HeartPulse,
  Home,
  Landmark,
  Megaphone,
  MoreHorizontal,
  Package,
  Percent,
  Plane,
  Receipt,
  Scale,
  ShieldCheck,
  Ship,
  ShoppingCart,
  Truck,
  Users,
  Wifi,
  Wrench,
  Zap,
  GraduationCap,
  Forklift,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const RULES: Array<[RegExp, LucideIcon]> = [
  [/insur/i, ShieldCheck],
  [/maint|repair/i, Wrench],
  [/market|advert|promo|campaign/i, Megaphone],
  [/^other|misc|general/i, MoreHorizontal],
  [/rent|lease|premises|property/i, Home],
  [/salar|wage|labou?r|staff|payroll|bonus|employee/i, Users],
  [/packing|packag|carton/i, Package],
  [/suppl|stationer|office/i, ShoppingCart],
  [/tax|duty|vat|gst|levy/i, Percent],
  [/import|clearing|custom|shipping|port/i, Ship],
  [/freight|carriage|cargo|courier|delivery/i, Truck],
  [/loading|unloading|handling/i, Forklift],
  [/fuel|petrol|diesel|gas\b/i, Fuel],
  [/transport|vehicle|car\b|conveyance/i, Car],
  [/travel|tour|air/i, Plane],
  [/utilit|electric|power|energy|bill/i, Zap],
  [/internet|phone|mobile|telecom|wifi/i, Wifi],
  [/bank|charges|interest|finance/i, Landmark],
  [/factory|production|manufactur/i, Factory],
  [/legal|professional|audit|consult/i, Scale],
  [/medical|health/i, HeartPulse],
  [/food|tea|lunch|refresh|entertain|meal/i, Coffee],
  [/training|education|course/i, GraduationCap],
  [/tools|equipment/i, Hammer],
  [/donation|charity|commission/i, HandCoins],
  [/building|admin/i, Building2],
]

/** Category colours are #rrggbb (colour input / defaults); anything else falls back, since
 *  the tints below append an alpha byte to the hex. */
const safeHex = (color: string | undefined, fallback: string) =>
  color && /^#[0-9a-f]{6}$/i.test(color) ? color : fallback

export function expenseCategoryIcon(name: string): LucideIcon {
  const match = RULES.find(([re]) => re.test(name))
  return match ? match[1] : Receipt
}

export function ExpenseCategoryIcon({
  name,
  color,
  className,
  size = 'md',
}: {
  name: string
  color?: string
  className?: string
  size?: 'sm' | 'md'
}) {
  const Icon = expenseCategoryIcon(name)
  const tint = safeHex(color, '#6366f1')
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg',
        size === 'sm' ? 'h-7 w-7' : 'h-9 w-9',
        className,
      )}
      // 8-digit hex = the category colour at ~14% opacity for the tile, full for the glyph.
      style={{ backgroundColor: `${tint}24`, color: tint }}
    >
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-[18px] w-[18px]'} />
    </span>
  )
}

/**
 * Compact category label for tables and cards: the category's own colour as a soft tint,
 * its icon in full colour, and the name in the theme's text colour (a raw category colour
 * like yellow would be unreadable on a light background).
 */
export function ExpenseCategoryChip({
  name,
  color,
  className,
}: {
  name: string
  color?: string
  className?: string
}) {
  const Icon = expenseCategoryIcon(name)
  const tint = safeHex(color, '#64748b')
  return (
    <span
      className={cn(
        'text-foreground inline-flex max-w-full items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs font-medium',
        className,
      )}
      style={{ backgroundColor: `${tint}1a`, borderColor: `${tint}40` }}
    >
      <Icon className='h-3.5 w-3.5 shrink-0' style={{ color: tint }} aria-hidden />
      <span className='truncate'>{name}</span>
    </span>
  )
}
