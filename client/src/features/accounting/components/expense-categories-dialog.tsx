/**
 * Expense Categories manager — classify categories as Direct or Indirect, switch them
 * on/off, map them to Chart-of-Accounts ledgers, delete them (defaults included), and add
 * the common direct / indirect heads in one click.
 *
 * Layout: icon header → search + type pills + New → (clean-up banner) → table
 * (# · Category · Type · Status · Actions; a compact two-column row on phones) →
 * "Common expenses" cards for Direct and Indirect.
 */

import { useMemo, useState } from 'react'
import {
  Building2,
  Check,
  Eraser,
  Factory,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import {
  expenseNatureOf,
  usageOf,
  useCreateExpenseCategoryMutation,
  useGetExpenseCategoriesQuery,
  useGetExpenseCategoryUsageQuery,
  useRemoveUnusedExpenseCategoriesMutation,
  useUpdateExpenseCategoryMutation,
  type ExpenseCategory,
  type ExpenseNature,
} from '@/stores/expenseCategory.api'
import { ExpenseCategoryEditorDialog } from './expense-category-editor-dialog'
import { DeleteExpenseCategoryDialog } from './delete-expense-category-dialog'
import { ExpenseCategoryIcon } from './expense-category-icon'
import {
  ExpenseNatureBadge,
  EXPENSE_NATURE_HELP,
  SUGGESTED_DIRECT_CATEGORIES,
  SUGGESTED_INDIRECT_CATEGORIES,
} from './expense-nature'

type Filter = 'all' | ExpenseNature

const idOf = (c: ExpenseCategory) => c.id || c._id || ''
const isActiveCategory = (c: ExpenseCategory) => c.isActive !== false

const SUGGESTION_COLORS: Record<ExpenseNature, string[]> = {
  direct: ['#d97706', '#ea580c', '#b45309', '#c2410c', '#ca8a04', '#a16207'],
  indirect: ['#2563eb', '#0891b2', '#7c3aed', '#0d9488', '#4f46e5', '#db2777', '#059669', '#9333ea', '#0284c7'],
}

/* Desktop columns: # · Category · Type · Status · Actions */
const ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[2.25rem_minmax(0,1fr)_7.5rem_5.5rem_5rem]'

export function ExpenseCategoriesDialog({
  open,
  onOpenChange,
  canManage,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  canManage: boolean
  onChanged?: () => void
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { data = [], isFetching } = useGetExpenseCategoriesQuery({ transactionType: 'business_expense' }, { skip: !open })
  const categories = useMemo(
    () => (Array.isArray(data) ? [...data] : []).sort((a, b) => a.name.localeCompare(b.name)),
    [data],
  )
  // Fresh each time the manager opens — expenses saved since then change the counts.
  const { data: usage } = useGetExpenseCategoryUsageQuery(undefined, { skip: !open, refetchOnMountOrArgChange: true })
  const [createCategory] = useCreateExpenseCategoryMutation()
  const [updateCategory] = useUpdateExpenseCategoryMutation()
  const [removeUnused, { isLoading: removingUnused }] = useRemoveUnusedExpenseCategoriesMutation()

  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<{ category: ExpenseCategory | null; nature?: ExpenseNature; name?: string } | null>(null)
  const [toDelete, setToDelete] = useState<ExpenseCategory | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [confirmCleanup, setConfirmCleanup] = useState(false)

  const counts = useMemo(() => {
    const direct = categories.filter((c) => expenseNatureOf(c) === 'direct').length
    return { all: categories.length, direct, indirect: categories.length - direct }
  }, [categories])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return categories.filter(
      (c) => (filter === 'all' || expenseNatureOf(c) === filter) && (!q || c.name.toLowerCase().includes(q)),
    )
  }, [categories, filter, search])

  const existingNames = useMemo(() => new Set(categories.map((c) => c.name.trim().toLowerCase())), [categories])

  // The starter list the app used to create on its own, where nothing uses the entry yet.
  const unusedDefaults = useMemo(
    () =>
      usage
        ? categories.filter((c) => {
            const u = usageOf(usage, c.name)
            return c.isDefault && u.expenses === 0 && u.recurringRules === 0
          })
        : [],
    [categories, usage],
  )

  const runCleanup = async () => {
    try {
      const result = await removeUnused({ onlyDefaults: true }).unwrap()
      toast.success(t('Removed {{count}} unused default categories', { count: result.removed.length }))
      setConfirmCleanup(false)
      onChanged?.()
    } catch (err: unknown) {
      toast.error((err as { data?: { message?: string } })?.data?.message || t('Failed to remove categories'))
    }
  }

  const addSuggestions = async (names: string[], nature: ExpenseNature) => {
    const missing = names.filter((n) => !existingNames.has(n.toLowerCase()))
    if (missing.length === 0) return
    let added = 0
    for (const [i, name] of missing.entries()) {
      setAdding(name)
      try {
        // eslint-disable-next-line no-await-in-loop
        await createCategory({
          name,
          transactionType: 'business_expense',
          expenseNature: nature,
          color: SUGGESTION_COLORS[nature][i % SUGGESTION_COLORS[nature].length],
        }).unwrap()
        added += 1
      } catch (err: unknown) {
        toast.error((err as { data?: { message?: string } })?.data?.message || t('Failed to create category'))
      }
    }
    setAdding(null)
    if (added === 1) {
      toast.success(
        nature === 'direct'
          ? t('Added "{{name}}" as a direct expense', { name: missing[0] })
          : t('Added "{{name}}" as an indirect expense', { name: missing[0] }),
      )
    } else if (added > 1) {
      toast.success(t('Added {{count}} categories', { count: added }))
    }
    if (added) onChanged?.()
  }

  const toggleActive = async (c: ExpenseCategory, active: boolean) => {
    const id = idOf(c)
    setToggling(id)
    try {
      await updateCategory({ id, transactionType: 'business_expense', isActive: active }).unwrap()
      toast.success(
        active
          ? t('"{{name}}" is active again', { name: c.name })
          : t('"{{name}}" is now inactive — hidden from new expenses, history kept', { name: c.name }),
      )
      onChanged?.()
    } catch (err: unknown) {
      toast.error((err as { data?: { message?: string } })?.data?.message || t('Failed to update category'))
    } finally {
      setToggling(null)
    }
  }

  const filterPills: { value: Filter; label: string; count: number }[] = [
    { value: 'all', label: t('All'), count: counts.all },
    { value: 'direct', label: t('Direct'), count: counts.direct },
    { value: 'indirect', label: t('Indirect'), count: counts.indirect },
  ]

  const usageLine = (c: ExpenseCategory) => {
    if (!usage) return ''
    const u = usageOf(usage, c.name)
    if (!u.expenses) return t('Not used yet')
    const count = u.expenses === 1 ? t('1 expense') : t('{{count}} expenses', { count: u.expenses })
    return `${count} · ${formatMoney(u.total)}`
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className='flex max-h-[92vh] max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl'>
          {/* ── Header ── */}
          <DialogHeader className='shrink-0 px-5 pt-5 pb-4 text-left sm:px-6 sm:pt-6'>
            <div className='flex items-start gap-3 pr-8 sm:gap-4'>
              <span className='bg-foreground text-background flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm sm:h-12 sm:w-12'>
                <Wallet className='h-5 w-5 sm:h-6 sm:w-6' />
              </span>
              <div className='min-w-0'>
                <DialogTitle className='text-lg sm:text-xl'>{t('Expense Categories')}</DialogTitle>
                <DialogDescription className='mt-1'>
                  {t('Direct expenses reduce Gross Profit (cost of sales). Indirect expenses reduce Net Profit (running costs).')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* ── Toolbar ── desktop: search · pills · New; phones: search + New, pills below. */}
          <div className='flex shrink-0 flex-wrap items-center gap-2 px-5 pb-3 sm:flex-nowrap sm:px-6'>
            <div className='relative order-1 min-w-0 flex-1'>
              <Search className='text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Search categories...')}
                className='h-10 rounded-xl pl-9'
              />
            </div>
            <div className='order-3 flex w-full items-center gap-1.5 sm:order-2 sm:w-auto'>
              {filterPills.map((pill) => (
                <button
                  key={pill.value}
                  type='button'
                  onClick={() => setFilter(pill.value)}
                  aria-pressed={filter === pill.value}
                  className={cn(
                    'h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors max-sm:flex-1 max-sm:px-2',
                    filter === pill.value
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-background text-muted-foreground hover:text-foreground hover:bg-muted',
                  )}
                >
                  {pill.label} ({pill.count})
                </button>
              ))}
            </div>
            {canManage && (
              <Button
                className='order-2 h-10 shrink-0 rounded-xl sm:order-3 sm:h-9'
                onClick={() => setEditor({ category: null, nature: filter === 'direct' ? 'direct' : 'indirect' })}
                aria-label={t('New Category')}
              >
                <Plus className='h-4 w-4 sm:mr-1.5' />
                <span className='max-sm:hidden'>{t('New Category')}</span>
              </Button>
            )}
          </div>

          {/* ── Scrolling body ── */}
          <div className='min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6'>
            {canManage && unusedDefaults.length > 0 && (
              <div className='flex flex-wrap items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-sm'>
                <Eraser className='text-muted-foreground h-4 w-4 shrink-0' />
                <span className='min-w-0 flex-1'>
                  {t('{{count}} starter categories the app created for you are not used by any expense.', { count: unusedDefaults.length })}
                </span>
                <Button size='sm' variant='outline' className='h-8' onClick={() => setConfirmCleanup(true)}>
                  {t('Remove unused')}
                </Button>
              </div>
            )}

            {/* ── Table ── */}
            <div className='overflow-hidden rounded-xl border'>
              <div className={cn(ROW_GRID, 'bg-muted/60 text-muted-foreground px-4 py-2.5 text-xs font-semibold tracking-wide uppercase max-sm:hidden')}>
                <span>#</span>
                <span>{t('Category Name')}</span>
                <span>{t('Type')}</span>
                <span>{t('Status')}</span>
                <span className='text-right'>{t('Actions')}</span>
              </div>

              {isFetching && categories.length === 0 ? (
                <div className='flex items-center justify-center py-12'>
                  <Loader2 className='text-muted-foreground h-5 w-5 animate-spin' />
                </div>
              ) : shown.length === 0 ? (
                <div className='text-muted-foreground px-4 py-12 text-center text-sm'>
                  <p className='text-foreground font-medium'>
                    {categories.length === 0 ? t('No expense categories yet') : t('No categories found')}
                  </p>
                  {categories.length === 0 && canManage && (
                    <p className='mt-1 text-xs'>{t('Create your own, or add common ones from the lists below.')}</p>
                  )}
                </div>
              ) : (
                <ul className='divide-y'>
                  {shown.map((c, index) => {
                    const active = isActiveCategory(c)
                    const id = idOf(c)
                    return (
                      <li key={id} className={cn(ROW_GRID, 'px-4 py-2.5 transition-colors hover:bg-muted/40')}>
                        <span className='bg-muted text-muted-foreground flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium tabular-nums max-sm:hidden'>
                          {index + 1}
                        </span>

                        <div className={cn('flex min-w-0 items-center gap-3', !active && 'opacity-55')}>
                          <ExpenseCategoryIcon name={c.name} color={c.color} />
                          <div className='min-w-0'>
                            <p className='truncate text-sm font-medium'>{c.name}</p>
                            <p className='text-muted-foreground flex min-w-0 items-center gap-1.5 truncate text-xs'>
                              <ExpenseNatureBadge nature={expenseNatureOf(c)} compact className='sm:hidden' />
                              <span className='truncate'>
                                {[usageLine(c), c.accountCode ? `${t('Account')} ${c.accountCode}` : '', !active ? t('Inactive') : '']
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                            </p>
                          </div>
                        </div>

                        <span className={cn('max-sm:hidden', !active && 'opacity-55')}>
                          <ExpenseNatureBadge nature={expenseNatureOf(c)} compact />
                        </span>

                        <div className='flex items-center justify-end gap-1 max-sm:hidden sm:justify-start'>
                          <Switch
                            checked={active}
                            disabled={!canManage || toggling === id}
                            onCheckedChange={(v) => toggleActive(c, v)}
                            aria-label={active ? t('Active — click to deactivate') : t('Inactive — click to activate')}
                            className='data-[state=checked]:bg-emerald-600'
                          />
                        </div>

                        <div className='flex items-center justify-end gap-0.5'>
                          <Switch
                            checked={active}
                            disabled={!canManage || toggling === id}
                            onCheckedChange={(v) => toggleActive(c, v)}
                            aria-label={active ? t('Active — click to deactivate') : t('Inactive — click to activate')}
                            className='mr-1 data-[state=checked]:bg-emerald-600 sm:hidden'
                          />
                          {canManage && (
                            <>
                              <Button
                                variant='ghost'
                                size='icon'
                                className='h-8 w-8'
                                aria-label={t('Edit category')}
                                title={t('Edit category')}
                                onClick={() => setEditor({ category: { ...c, id } })}
                              >
                                <Pencil className='h-4 w-4' />
                              </Button>
                              <Button
                                variant='ghost'
                                size='icon'
                                className='text-destructive hover:text-destructive h-8 w-8'
                                aria-label={t('Delete category')}
                                title={t('Delete category')}
                                onClick={() => setToDelete({ ...c, id })}
                              >
                                <Trash2 className='h-4 w-4' />
                              </Button>
                            </>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* ── Common expenses ── */}
            {canManage && (
              <section className='space-y-2.5'>
                <div>
                  <h3 className='text-sm font-semibold'>{t('Common expenses')}</h3>
                  <p className='text-muted-foreground text-xs'>{t('Add the heads you use in one click. Ones you already have are ticked.')}</p>
                </div>
                <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                  {([
                    ['direct', SUGGESTED_DIRECT_CATEGORIES],
                    ['indirect', SUGGESTED_INDIRECT_CATEGORIES],
                  ] as const).map(([nature, names]) => {
                    const missing = names.filter((n) => !existingNames.has(n.toLowerCase()))
                    const isDirect = nature === 'direct'
                    const HeadIcon = isDirect ? Factory : Building2
                    return (
                      <div
                        key={nature}
                        className={cn(
                          'min-w-0 rounded-xl border p-3.5',
                          isDirect
                            ? 'border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20'
                            : 'border-sky-200 bg-sky-50/60 dark:border-sky-900/60 dark:bg-sky-950/20',
                        )}
                      >
                        <div className='mb-2.5 flex items-start gap-2.5'>
                          <span
                            className={cn(
                              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                              isDirect
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                                : 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300',
                            )}
                          >
                            <HeadIcon className='h-4 w-4' />
                          </span>
                          <div className='min-w-0 flex-1'>
                            <p className='text-sm font-semibold'>{t(isDirect ? 'Direct expenses' : 'Indirect expenses')}</p>
                            <p className='text-muted-foreground text-xs'>{t(EXPENSE_NATURE_HELP[nature])}</p>
                          </div>
                          {missing.length > 1 && (
                            <Button
                              type='button'
                              size='sm'
                              variant='outline'
                              className='h-7 shrink-0 bg-background px-2 text-xs'
                              disabled={adding !== null}
                              onClick={() => addSuggestions(names, nature)}
                            >
                              {t('Add all')}
                            </Button>
                          )}
                        </div>
                        <div className='flex flex-wrap gap-1.5'>
                          {names.map((name) => {
                            const have = existingNames.has(name.toLowerCase())
                            return (
                              <button
                                key={name}
                                type='button'
                                disabled={have || adding !== null}
                                onClick={() => addSuggestions([name], nature)}
                                className={cn(
                                  'bg-background inline-flex h-8 max-w-full items-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition-colors',
                                  have ? 'text-muted-foreground cursor-default' : 'hover:border-foreground/30 hover:bg-muted',
                                  !have && adding !== null && 'opacity-60',
                                )}
                              >
                                <ExpenseCategoryIcon
                                  name={name}
                                  color={isDirect ? '#d97706' : '#0284c7'}
                                  size='sm'
                                  className='-ml-1 h-6 w-6'
                                />
                                <span className='truncate'>{t(name)}</span>
                                {adding === name ? (
                                  <Loader2 className='h-3.5 w-3.5 shrink-0 animate-spin' />
                                ) : have ? (
                                  <Check className='h-3.5 w-3.5 shrink-0 text-emerald-600' />
                                ) : (
                                  <Plus className='h-3.5 w-3.5 shrink-0' />
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ExpenseCategoryEditorDialog
        open={!!editor}
        onOpenChange={(o) => !o && setEditor(null)}
        category={editor?.category ?? null}
        initialNature={editor?.nature}
        initialName={editor?.name}
        onSaved={() => onChanged?.()}
      />

      <DeleteExpenseCategoryDialog
        category={toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        onDeleted={() => onChanged?.()}
      />

      <AlertDialog open={confirmCleanup} onOpenChange={setConfirmCleanup}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Remove unused default categories?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('These starter categories are not used by any expense or recurring rule:')}{' '}
              <span className='text-foreground font-medium'>{unusedDefaults.map((c) => c.name).join(', ')}</span>.{' '}
              {t('Categories that are in use, and the ones you created, are kept. They will not be created again.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removingUnused}>{t('Cancel')}</AlertDialogCancel>
            <Button type='button' variant='destructive' disabled={removingUnused} onClick={runCleanup}>
              {removingUnused && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              {t('Remove {{count}}', { count: unusedDefaults.length })}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
