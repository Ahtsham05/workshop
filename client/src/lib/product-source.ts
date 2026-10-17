import type { LucideIcon } from 'lucide-react'
import { ArrowLeftRight, Bot, FileSpreadsheet, GitBranch, PencilLine, Smartphone, Sparkles, Upload } from 'lucide-react'
import type { ProductSource } from '@/stores/product.api'

/** How a product was created — server config/productSources.js. Badge text + icon per value. */
export const PRODUCT_SOURCE_META: Record<ProductSource, { label: string; short: string; icon: LucideIcon; className: string }> = {
  manual: {
    label: 'Created manually',
    short: 'Manual',
    icon: PencilLine,
    className: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300',
  },
  excel_import: {
    label: 'Imported from Excel',
    short: 'Excel',
    icon: FileSpreadsheet,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  ai_scan: {
    label: 'Added by AI scan',
    short: 'AI scan',
    icon: Bot,
    className: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300',
  },
  branch_import: {
    label: 'Imported from another branch',
    short: 'Branch import',
    icon: Upload,
    className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  },
  branch_sync: {
    label: 'Sent from another branch',
    short: 'Branch sync',
    icon: GitBranch,
    className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  },
  stock_transfer: {
    label: 'Created by a stock transfer',
    short: 'Transfer',
    icon: ArrowLeftRight,
    className: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300',
  },
  phone_buyback: {
    label: 'Used-phone buyback',
    short: 'Buyback',
    icon: Smartphone,
    className: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300',
  },
  demo: {
    label: 'Demo data',
    short: 'Demo',
    icon: Sparkles,
    className: 'border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-900 dark:bg-pink-950/40 dark:text-pink-300',
  },
}

export const PRODUCT_SOURCE_VALUES = Object.keys(PRODUCT_SOURCE_META) as ProductSource[]

export const productSourceMeta = (source: string | null | undefined) =>
  source && source in PRODUCT_SOURCE_META ? PRODUCT_SOURCE_META[source as ProductSource] : null
