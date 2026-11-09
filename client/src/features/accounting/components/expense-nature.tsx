/**
 * Direct vs Indirect expense — the shared vocabulary for every expense screen.
 *
 *  Direct   — part of the cost of the goods/services sold: freight & carriage inward,
 *             direct labour, factory power, packing. Comes off GROSS profit (trading
 *             account) and posts under Cost of Sales in the Chart of Accounts.
 *  Indirect — cost of running the business: rent, office salaries, utilities, marketing.
 *             Comes off NET profit. Every category is indirect until changed, which is
 *             how all expenses were treated before this classification existed.
 */

import { Factory, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import type { ExpenseNature } from '@/stores/expenseCategory.api'

export const EXPENSE_NATURE_LABEL: Record<ExpenseNature, string> = {
  direct: 'Direct',
  indirect: 'Indirect',
}

export const EXPENSE_NATURE_HELP: Record<ExpenseNature, string> = {
  direct: 'Cost of buying or making what you sell — reduces Gross Profit',
  indirect: 'Cost of running the business — reduces Net Profit',
}

export const EXPENSE_NATURE_EXAMPLES: Record<ExpenseNature, string> = {
  direct: 'Freight inward, carriage, direct labour, factory power, packing, import duty',
  indirect: 'Rent, office salaries, utilities, marketing, internet, bank charges',
}

/**
 * Common running costs offered as one-click categories. Nothing is created automatically
 * any more — a business adds only the categories it actually uses.
 */
export const SUGGESTED_INDIRECT_CATEGORIES = [
  'Rent',
  'Utilities',
  'Salaries',
  'Internet & Phone',
  'Transportation',
  'Marketing',
  'Office Supplies',
  'Repairs & Maintenance',
  'Bank Charges',
]

/** Common direct-expense heads offered as one-click categories. */
export const SUGGESTED_DIRECT_CATEGORIES = [
  'Freight & Carriage Inward',
  'Direct Labour / Wages',
  'Factory Power & Fuel',
  'Packing Material',
  'Import Duty & Clearing',
  'Loading & Unloading',
]

export function ExpenseNatureBadge({
  nature,
  className,
  compact = false,
}: {
  nature?: ExpenseNature | null
  className?: string
  compact?: boolean
}) {
  const { t } = useLanguage()
  const isDirect = nature === 'direct'
  const Icon = isDirect ? Factory : Building2
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap',
        isDirect
          ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
          : 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300',
        className,
      )}
      title={t(EXPENSE_NATURE_HELP[isDirect ? 'direct' : 'indirect'])}
    >
      <Icon className='h-3 w-3' />
      {compact ? t(isDirect ? 'Direct' : 'Indirect') : t(isDirect ? 'Direct expense' : 'Indirect expense')}
    </span>
  )
}

/** Two big choice cards: what each type means, with examples. */
export function ExpenseNaturePicker({
  value,
  onChange,
  disabled,
  dense = false,
}: {
  value: ExpenseNature
  onChange: (value: ExpenseNature) => void
  disabled?: boolean
  dense?: boolean
}) {
  const { t } = useLanguage()
  return (
    <div role='radiogroup' className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
      {(['indirect', 'direct'] as ExpenseNature[]).map((nature) => {
        const selected = value === nature
        const Icon = nature === 'direct' ? Factory : Building2
        return (
          <button
            key={nature}
            type='button'
            role='radio'
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(nature)}
            className={cn(
              'flex min-w-0 items-start gap-2 rounded-lg border p-3 text-left transition-colors',
              'focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2',
              selected
                ? nature === 'direct'
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30'
                  : 'border-sky-500 bg-sky-50 dark:bg-sky-950/30'
                : 'hover:bg-muted/60',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', nature === 'direct' ? 'text-amber-600' : 'text-sky-600')} />
            <span className='min-w-0'>
              <span className='block text-sm font-medium'>{t(nature === 'direct' ? 'Direct expense' : 'Indirect expense')}</span>
              <span className='text-muted-foreground block text-xs'>{t(EXPENSE_NATURE_HELP[nature])}</span>
              {!dense && (
                <span className='text-muted-foreground/80 mt-1 block text-[11px]'>
                  {t('e.g.')} {t(EXPENSE_NATURE_EXAMPLES[nature])}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
