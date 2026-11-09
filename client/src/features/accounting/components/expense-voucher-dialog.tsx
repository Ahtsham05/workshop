/**
 * Expense Voucher — record several expenses paid from ONE account in one entry, the way a
 * cash/bank payment voucher is written up: one date, one "paid from" account, many lines.
 *
 * Every line is saved by the server as its own normal expense (cash book / bank entry,
 * journal entry, Direct/Indirect from its category) under a shared EV-number, and the
 * whole voucher is all-or-nothing — see expense.service.js#createExpenseVoucher.
 *
 * Keyboard-first: Category → (pick) → Description → Enter → Paid to → Enter → Amount →
 * Enter → next line's category opens (a new line is added at the end). Ctrl+Enter saves.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { ListPlus, Loader2, Plus, Save, Trash2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { useCurrencyMeta, useFormatMoney } from '@/lib/format-money'
import { useStateDraft } from '@/hooks/use-form-draft'
import { FormDraftNotice } from '@/components/form-draft-notice'
import { useGetWalletsQuery } from '@/stores/mobile-shop.api'
import { expenseNatureOf, useGetExpenseCategoriesQuery } from '@/stores/expenseCategory.api'
import { useCreateExpenseVoucherMutation } from '@/stores/expense.api'
import { ExpenseCategoryIcon } from './expense-category-icon'
import { ExpenseNatureBadge } from './expense-nature'
import {
  buildMergedPaymentOptions,
  getWalletTypeFromOptionValue,
  isWalletOptionValue,
} from '@/lib/wallet-payment-options'

interface VoucherLine {
  key: string
  category: string
  description: string
  vendor: string
  amount: string
}

interface VoucherState extends Record<string, unknown> {
  date: string
  paidFrom: string
  reference: string
  notes: string
  lines: VoucherLine[]
}

const START_ROWS = 6
/**
 * Line ids must be unique for the life of the tab — NOT a counter from 1: a restored draft
 * already holds ids from the previous page load, and a restarted counter handed the same ids
 * out again. Rows sharing an id were edited together (one amount typed → every row), showed
 * duplicate numbers, and opened the category list on the wrong row.
 */
const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
const newLine = (): VoucherLine => ({ key: uid(), category: '', description: '', vendor: '', amount: '' })
/** Give every restored line a fresh id (also heals drafts saved with duplicate ids). */
const rekey = (lines: VoucherLine[] | undefined): VoucherLine[] => {
  const list = Array.isArray(lines) && lines.length ? lines : Array.from({ length: START_ROWS }, () => ({ key: '', category: '', description: '', vendor: '', amount: '' }))
  return list.map((l) => ({ ...l, key: uid() }))
}
const freshState = (): VoucherState => ({
  date: format(new Date(), 'yyyy-MM-dd'),
  paidFrom: 'Cash',
  reference: '',
  notes: '',
  lines: Array.from({ length: START_ROWS }, newLine),
})

const amountOf = (line: VoucherLine) => {
  const n = Number(String(line.amount).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}
const isBlank = (line: VoucherLine) => !line.category && !line.description.trim() && !line.vendor.trim() && !String(line.amount).trim()

/* Desktop columns: # · Category · Description · Paid to · Amount · remove */
const LINE_GRID =
  'grid grid-cols-[minmax(0,1fr)_7.5rem_2.25rem] gap-2 sm:grid-cols-[1.75rem_minmax(15rem,1.4fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_8rem_2.25rem] sm:items-center'

export function ExpenseVoucherDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const currencyMeta = useCurrencyMeta()
  const [state, setState] = useState<VoucherState>(freshState)
  const [submitted, setSubmitted] = useState(false)
  const [openCategoryRow, setOpenCategoryRow] = useState<string | null>(null)
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})
  const rows = useRef<Record<string, HTMLLIElement | null>>({})

  // Both queries are already cached by the Expenses page (categories) and the expense form
  // / bank pages (wallets) — opening the voucher normally costs no request at all.
  const { data: categoryData = [] } = useGetExpenseCategoriesQuery({ transactionType: 'business_expense' }, { skip: !open })
  const { data: walletsData } = useGetWalletsQuery(undefined, { skip: !open })
  const [createVoucher, { isLoading: saving }] = useCreateExpenseVoucherMutation()

  const draft = useStateDraft(
    state,
    (restored) => setState((prev) => ({ ...prev, ...restored, lines: rekey(restored.lines) })),
    { key: 'expense-voucher', enabled: open, label: 'expense voucher', exclude: ['date'] },
  )

  const categories = useMemo(
    () => (Array.isArray(categoryData) ? categoryData : []).filter((c) => c.isActive !== false),
    [categoryData],
  )
  const natureByName = useMemo(
    () => new Map(categories.map((c) => [c.name.toLowerCase(), expenseNatureOf(c)])),
    [categories],
  )
  const categoryOptions = useMemo(
    () =>
      [...categories]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({
          value: c.name,
          label: c.name,
          // badge (text) still feeds search; the coloured pieces are what is shown.
          badge: expenseNatureOf(c) === 'direct' ? t('Direct') : t('Indirect'),
          leading: <ExpenseCategoryIcon name={c.name} color={c.color} size='sm' className='h-6 w-6' />,
          badgeNode: <ExpenseNatureBadge nature={expenseNatureOf(c)} compact />,
        })),
    [categories, t],
  )

  const wallets = useMemo(() => (walletsData?.results ?? []).filter((w) => w.isActive), [walletsData])
  const paidFromOptions = useMemo(
    () => buildMergedPaymentOptions([{ value: 'Cash', label: t('Cash') }], wallets, true, currencyMeta),
    [wallets, currencyMeta, t],
  )
  const selectedWallet = isWalletOptionValue(state.paidFrom)
    ? wallets.find((w) => w.type === getWalletTypeFromOptionValue(state.paidFrom))
    : wallets.find((w) => w.accountType === 'cash')

  // ── Totals & checks ──
  const filled = state.lines.filter((l) => !isBlank(l))
  const lineError = (line: VoucherLine): string | null => {
    if (isBlank(line)) return null
    if (!line.category) return t('Choose a category')
    if (amountOf(line) <= 0) return t('Enter an amount')
    return null
  }
  const totals = filled.reduce(
    (acc, line) => {
      const amt = Math.max(0, amountOf(line))
      acc.total += amt
      if (natureByName.get(line.category.toLowerCase()) === 'direct') acc.direct += amt
      return acc
    },
    { total: 0, direct: 0 },
  )
  const errors = filled.map(lineError).filter(Boolean)
  const balance = typeof selectedWallet?.balance === 'number' ? selectedWallet.balance : null
  const overdraws = balance !== null && totals.total > 0 && totals.total > balance

  // ── Editing ──
  const updateLine = useCallback((key: string, patch: Partial<VoucherLine>) => {
    setState((prev) => ({ ...prev, lines: prev.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }))
  }, [])
  const removeLine = (key: string) =>
    setState((prev) => {
      const lines = prev.lines.filter((l) => l.key !== key)
      return { ...prev, lines: lines.length ? lines : [newLine()] }
    })
  const addLines = (count = 1) => setState((prev) => ({ ...prev, lines: [...prev.lines, ...Array.from({ length: count }, newLine)] }))

  /** Input → input: focus at once, so the next keystrokes can't land in the old field.
   *  After the category list closes, wait two frames — Radix restores focus on close. */
  const focusInput = (id: string, afterPopover = false) => {
    if (!afterPopover) {
      inputs.current[id]?.focus()
      return
    }
    requestAnimationFrame(() => requestAnimationFrame(() => inputs.current[id]?.focus()))
  }

  /** Bring a row into view first, then open its category list — opening it while the row
   *  is scrolled out of the dialog anchors the list to an invisible trigger. */
  const openCategoryOn = (key: string) => {
    requestAnimationFrame(() => {
      rows.current[key]?.scrollIntoView({ block: 'nearest' })
      requestAnimationFrame(() => setOpenCategoryRow(key))
    })
  }

  /** Enter on a line's Amount: open the next line's category, adding a line at the end. */
  const advanceFrom = (key: string) => {
    const index = state.lines.findIndex((l) => l.key === key)
    const next = index >= 0 ? state.lines[index + 1] : undefined
    if (next) {
      openCategoryOn(next.key)
    } else {
      const line = newLine()
      setState((prev) => ({ ...prev, lines: [...prev.lines, line] }))
      openCategoryOn(line.key)
    }
  }

  const reset = () => {
    setState(freshState())
    setSubmitted(false)
  }

  const handleSave = async () => {
    setSubmitted(true)
    if (filled.length === 0) {
      toast.error(t('Add at least one expense line'))
      return
    }
    if (errors.length) {
      toast.error(t('Fix the highlighted lines first'))
      return
    }
    const isWallet = isWalletOptionValue(state.paidFrom)
    try {
      const result = await createVoucher({
        date: state.date,
        paymentMethod: isWallet ? 'Wallet' : state.paidFrom,
        walletType: isWallet ? getWalletTypeFromOptionValue(state.paidFrom) : undefined,
        reference: state.reference.trim() || undefined,
        notes: state.notes.trim() || undefined,
        lines: filled.map((l) => ({
          category: l.category,
          description: l.description.trim() || undefined,
          vendor: l.vendor.trim() || undefined,
          amount: Math.round(amountOf(l) * 100) / 100,
        })),
      }).unwrap()
      toast.success(
        t('{{number}} saved — {{count}} expenses, {{total}}', {
          number: result.voucherNumber,
          count: result.expenses.length,
          total: formatMoney(result.total),
        }),
      )
      draft.clear()
      reset()
      onSaved?.()
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error((err as { data?: { message?: string } })?.data?.message || t('Failed to save the voucher'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className='flex max-h-[94vh] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(84rem,calc(100%-2rem))]'
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            void handleSave()
          }
        }}
      >
        <DialogHeader className='shrink-0 border-b px-4 pt-4 pb-3 text-left sm:px-6 sm:pt-5'>
          <div className='flex items-start gap-3 pr-8'>
            <span className='bg-foreground text-background flex h-10 w-10 shrink-0 items-center justify-center rounded-xl'>
              <ListPlus className='h-5 w-5' />
            </span>
            <div className='min-w-0'>
              <DialogTitle className='text-lg'>{t('Expense Voucher')}</DialogTitle>
              <DialogDescription>
                {t('Several expenses paid from one account, in one entry. Each line is saved as its own expense under one voucher number (EV-…).')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className='min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6'>
          <FormDraftNotice draft={draft} />

          {/* ── Voucher header ── */}
          <div className='grid grid-cols-2 gap-3 lg:grid-cols-[10rem_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.3fr)]'>
            <div className='space-y-1.5'>
              <Label htmlFor='ev-date'>{t('Date')}</Label>
              <Input
                id='ev-date'
                type='date'
                value={state.date}
                onChange={(e) => setState((p) => ({ ...p, date: e.target.value }))}
              />
            </div>
            <div className='space-y-1.5'>
              <Label>{t('Paid From')}</Label>
              <Select value={state.paidFrom} onValueChange={(v) => setState((p) => ({ ...p, paidFrom: v }))}>
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paidFromOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='ev-ref'>{t('Reference')}</Label>
              <Input
                id='ev-ref'
                value={state.reference}
                onChange={(e) => setState((p) => ({ ...p, reference: e.target.value }))}
                placeholder={t('Voucher / bill no.')}
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='ev-notes'>{t('Narration')}</Label>
              <Input
                id='ev-notes'
                value={state.notes}
                onChange={(e) => setState((p) => ({ ...p, notes: e.target.value }))}
                placeholder={t('e.g. Daily petty cash expenses')}
              />
            </div>
          </div>

          {/* ── Lines ── */}
          <div className='overflow-hidden rounded-xl border'>
            <div className={cn(LINE_GRID, 'bg-muted/60 text-muted-foreground px-3 py-2 text-xs font-semibold tracking-wide uppercase max-sm:hidden')}>
              <span>#</span>
              <span>{t('Category')}</span>
              <span>{t('Description')}</span>
              <span>{t('Paid to')}</span>
              <span className='text-right'>{t('Amount')}</span>
              <span />
            </div>
            <ul className='divide-y'>
              {state.lines.map((line, index) => {
                const error = submitted ? lineError(line) : null
                return (
                  <li
                    key={line.key}
                    ref={(el) => {
                      rows.current[line.key] = el
                    }}
                    className={cn('scroll-my-2 px-3 py-2', error && 'bg-red-50/70 dark:bg-red-950/20')}
                  >
                    <div className={LINE_GRID}>
                      <span className='text-muted-foreground text-xs tabular-nums max-sm:hidden'>{index + 1}</span>

                      <div className='min-w-0 max-sm:col-span-3'>
                        <SearchableSelect
                          options={categoryOptions}
                          value={line.category}
                          onValueChange={(v) => updateLine(line.key, { category: v })}
                          placeholder={t('Select category')}
                          searchPlaceholder={t('Search categories...')}
                          emptyText={t('No categories found')}
                          deselectable={false}
                          returnFocus={false}
                          open={openCategoryRow === line.key}
                          onOpenChange={(o) => setOpenCategoryRow(o ? line.key : null)}
                          onSelected={() => focusInput(`${line.key}:description`, true)}
                          className={cn('h-9 w-full', error && !line.category && 'border-red-500')}
                          // Wider than the column so full names show; flips up near the bottom.
                          popoverClassName='w-[min(26rem,calc(100vw-2rem))]'
                        />
                      </div>

                      <Input
                        ref={(el) => {
                          inputs.current[`${line.key}:description`] = el
                        }}
                        value={line.description}
                        onChange={(e) => updateLine(line.key, { description: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                            e.preventDefault()
                            focusInput(`${line.key}:vendor`)
                          }
                        }}
                        placeholder={t('Description')}
                        className='h-9 max-sm:col-span-3'
                      />
                      <Input
                        ref={(el) => {
                          inputs.current[`${line.key}:vendor`] = el
                        }}
                        value={line.vendor}
                        onChange={(e) => updateLine(line.key, { vendor: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                            e.preventDefault()
                            focusInput(`${line.key}:amount`)
                          }
                        }}
                        placeholder={t('Paid to (optional)')}
                        className='h-9'
                      />
                      <Input
                        ref={(el) => {
                          inputs.current[`${line.key}:amount`] = el
                        }}
                        inputMode='decimal'
                        value={line.amount}
                        onChange={(e) => updateLine(line.key, { amount: e.target.value.replace(/[^\d.,]/g, '') })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                            e.preventDefault()
                            advanceFrom(line.key)
                          }
                        }}
                        placeholder='0.00'
                        className={cn('h-9 text-right tabular-nums', error && amountOf(line) <= 0 && line.category && 'border-red-500')}
                      />
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className='text-muted-foreground hover:text-destructive h-9 w-9'
                        aria-label={t('Remove line')}
                        onClick={() => removeLine(line.key)}
                      >
                        <Trash2 className='h-4 w-4' />
                      </Button>
                    </div>
                    {error && (
                      <p className='mt-1 text-xs text-red-600 sm:pl-[calc(1.75rem+0.5rem)]'>{error}</p>
                    )}
                  </li>
                )
              })}
            </ul>
            <div className='bg-muted/30 flex flex-wrap items-center gap-2 border-t px-3 py-2'>
              <Button type='button' variant='outline' size='sm' className='h-8' onClick={() => addLines(1)}>
                <Plus className='mr-1 h-3.5 w-3.5' />
                {t('Add line')}
              </Button>
              <Button type='button' variant='ghost' size='sm' className='h-8' onClick={() => addLines(5)}>
                {t('+5 lines')}
              </Button>
              <span className='text-muted-foreground ml-auto text-xs max-sm:hidden'>
                {t('Enter moves to the next field · Ctrl+Enter saves')}
              </span>
            </div>
          </div>

          {/* ── Summary ── */}
          <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
            {[
              { label: t('Lines'), value: String(filled.length) },
              { label: t('Direct'), value: formatMoney(totals.direct), tone: 'text-amber-700 dark:text-amber-400' },
              { label: t('Indirect'), value: formatMoney(totals.total - totals.direct), tone: 'text-sky-700 dark:text-sky-400' },
              { label: t('Voucher total'), value: formatMoney(totals.total), tone: 'text-foreground', strong: true },
            ].map((tile) => (
              <div key={tile.label} className={cn('rounded-xl border px-3 py-2', tile.strong && 'bg-muted/50')}>
                <p className='text-muted-foreground text-xs'>{tile.label}</p>
                <p className={cn('text-lg font-semibold tabular-nums', tile.tone, tile.strong && 'text-xl font-bold')}>{tile.value}</p>
              </div>
            ))}
          </div>
          {overdraws && (
            <p className='flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'>
              <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
              {t('This voucher ({{total}}) is more than the account balance ({{balance}}). It will still be saved.', {
                total: formatMoney(totals.total),
                balance: formatMoney(balance ?? 0),
              })}
            </p>
          )}
        </div>

        <DialogFooter className='shrink-0 gap-2 border-t px-4 py-3 sm:px-6'>
          <Button
            type='button'
            variant='ghost'
            onClick={() => {
              reset()
              draft.clear()
            }}
            disabled={saving}
            className='sm:mr-auto'
          >
            {t('Clear')}
          </Button>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)} disabled={saving}>
            {t('Cancel')}
          </Button>
          <Button type='button' onClick={handleSave} disabled={saving || filled.length === 0}>
            {saving ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : <Save className='mr-2 h-4 w-4' />}
            {t('Save voucher')}
            {filled.length > 0 && ` · ${formatMoney(totals.total)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
