/**
 * Delete an expense category — default ones included. When expenses (or recurring rules)
 * already use it, the user chooses: move them to another category (recommended — they
 * take that category's Direct/Indirect type and ledger), or keep the old name on them as
 * plain text, which is what deleting always did.
 */

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import {
  expenseNatureOf,
  usageOf,
  useDeleteExpenseCategoryMutation,
  useGetExpenseCategoriesQuery,
  useGetExpenseCategoryUsageQuery,
  type ExpenseCategory,
} from '@/stores/expenseCategory.api'
import { ExpenseNatureBadge } from './expense-nature'

const idOf = (c: ExpenseCategory) => c.id || c._id || ''

export function DeleteExpenseCategoryDialog({
  category,
  onOpenChange,
  onDeleted,
}: {
  /** Category to delete; null = closed. */
  category: ExpenseCategory | null
  onOpenChange: (open: boolean) => void
  onDeleted?: (info: { name: string; movedTo?: string }) => void
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const open = !!category
  const { data: usage, isFetching: usageLoading } = useGetExpenseCategoryUsageQuery(undefined, {
    skip: !open,
    refetchOnMountOrArgChange: true,
  })
  const { data: all = [] } = useGetExpenseCategoriesQuery({ transactionType: 'business_expense' }, { skip: !open })
  const [deleteCategory, { isLoading: deleting }] = useDeleteExpenseCategoryMutation()

  const [mode, setMode] = useState<'move' | 'keep'>('move')
  const [moveTo, setMoveTo] = useState('')

  const used = category ? usageOf(usage, category.name) : { expenses: 0, total: 0, recurringRules: 0 }
  const isUsed = used.expenses > 0 || used.recurringRules > 0
  const targets = useMemo(
    () => (Array.isArray(all) ? all : []).filter((c) => category && idOf(c) !== idOf(category)),
    [all, category],
  )

  useEffect(() => {
    if (!open) return
    setMode('move')
    setMoveTo('')
  }, [open, category])

  const handleDelete = async () => {
    if (!category) return
    const moving = isUsed && mode === 'move'
    if (moving && !moveTo) {
      toast.error(t('Pick the category to move the expenses to'))
      return
    }
    try {
      const result = await deleteCategory({
        id: idOf(category),
        transactionType: 'business_expense',
        moveTo: moving ? moveTo : undefined,
      }).unwrap()
      const moved = result && 'moved' in result ? result.moved : null
      toast.success(
        moved
          ? t('Deleted "{{name}}" — {{count}} expenses moved to {{to}}', { name: category.name, count: moved.expenses, to: moved.to })
          : t('Category deleted'),
      )
      onDeleted?.({ name: category.name, movedTo: moved?.to })
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error((err as { data?: { message?: string } })?.data?.message || t('Failed to delete category'))
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Delete "{{name}}"?', { name: category?.name ?? '' })}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>
              {usageLoading && !usage ? (
                <span className='inline-flex items-center gap-2'>
                  <Loader2 className='h-3.5 w-3.5 animate-spin' />
                  {t('Checking where it is used…')}
                </span>
              ) : isUsed ? (
                <span>
                  {used.expenses === 1
                    ? t('It is used by 1 expense ({{total}})', { total: formatMoney(used.total) })
                    : t('It is used by {{count}} expenses ({{total}})', { count: used.expenses, total: formatMoney(used.total) })}
                  {used.recurringRules > 0 && ` ${t('and {{count}} recurring rules', { count: used.recurringRules })}`}
                  {'. '}
                  {t('What should happen to them?')}
                </span>
              ) : (
                <span>{t('Nothing uses this category, so it can be removed safely.')}</span>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isUsed && (
          <div className='space-y-2' role='radiogroup'>
            <label
              className={cn(
                'block cursor-pointer rounded-lg border p-3 text-sm',
                mode === 'move' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
              )}
            >
              <span className='flex items-center gap-2'>
                <input type='radio' name='delete-mode' checked={mode === 'move'} onChange={() => setMode('move')} />
                <span className='font-medium'>{t('Move them to another category')}</span>
                <span className='text-muted-foreground text-xs'>({t('recommended')})</span>
              </span>
              {mode === 'move' && (
                <div className='mt-2 space-y-1.5 pl-5'>
                  <Label className='text-xs'>{t('Move to')}</Label>
                  <Select value={moveTo} onValueChange={setMoveTo}>
                    <SelectTrigger className='h-9 w-full'>
                      <SelectValue placeholder={t('Select category')} />
                    </SelectTrigger>
                    <SelectContent>
                      {targets.map((c) => (
                        <SelectItem key={idOf(c)} value={idOf(c)}>
                          <span className='flex items-center gap-2'>
                            <span className='h-2 w-2 rounded-full' style={{ backgroundColor: c.color }} />
                            {c.name}
                            <ExpenseNatureBadge nature={expenseNatureOf(c)} compact />
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className='text-muted-foreground text-xs'>
                    {t('They take that category’s Direct/Indirect type, in reports and in the books.')}
                  </p>
                </div>
              )}
            </label>
            <label
              className={cn(
                'block cursor-pointer rounded-lg border p-3 text-sm',
                mode === 'keep' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
              )}
            >
              <span className='flex items-center gap-2'>
                <input type='radio' name='delete-mode' checked={mode === 'keep'} onChange={() => setMode('keep')} />
                <span className='font-medium'>{t('Keep them as they are')}</span>
              </span>
              <span className='text-muted-foreground block pl-5 text-xs'>
                {t('They keep "{{name}}" as text, but it will no longer be in the category list.', { name: category?.name ?? '' })}
              </span>
            </label>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>{t('Cancel')}</AlertDialogCancel>
          <Button
            type='button'
            variant='destructive'
            disabled={deleting || (usageLoading && !usage) || (isUsed && mode === 'move' && !moveTo)}
            onClick={handleDelete}
          >
            {deleting && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {isUsed && mode === 'move' ? t('Move & delete') : t('delete')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
