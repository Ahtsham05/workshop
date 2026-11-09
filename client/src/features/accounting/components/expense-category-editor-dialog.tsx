/**
 * Create / edit one business-expense category: name, Direct/Indirect, the ledger it posts
 * to (for users who can see the Chart of Accounts), colour and a note.
 *
 * Changing the type or posting account of a category that already has expenses asks
 * whether to move them too — the default, matching how moving a ledger between groups
 * behaves in accounting software — or to apply it to new expenses only.
 */

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import {
  expenseNatureOf,
  useCreateExpenseCategoryMutation,
  useUpdateExpenseCategoryMutation,
  type ExpenseCategory,
  type ExpenseNature,
} from '@/stores/expenseCategory.api'
import { useGetPostingAccountsQuery } from '@/stores/school.api'
import { ExpenseNaturePicker } from './expense-nature'

const DEFAULT_ACCOUNT = '__default__'
const PALETTE = ['#3b82f6', '#f59e0b', '#10b981', '#6366f1', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#ef4444']

interface PostingAccount {
  _id: string
  code: string
  name: string
  parentId?: string
}

export function ExpenseCategoryEditorDialog({
  open,
  onOpenChange,
  category,
  initialName = '',
  initialNature = 'indirect',
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Category to edit; omit to create a new one. */
  category?: ExpenseCategory | null
  initialName?: string
  initialNature?: ExpenseNature
  onSaved?: (category: ExpenseCategory, info: { renamedFrom?: string }) => void
}) {
  const { t } = useLanguage()
  const { hasPermission } = usePermissions()
  const canSeeChart = hasPermission('viewAccountsSystem') || hasPermission('manageAccountsSystem')
  const isEdit = !!category

  const [name, setName] = useState('')
  const [nature, setNature] = useState<ExpenseNature>('indirect')
  const [accountCode, setAccountCode] = useState<string>(DEFAULT_ACCOUNT)
  const [color, setColor] = useState(PALETTE[0])
  const [description, setDescription] = useState('')
  const [applyToExisting, setApplyToExisting] = useState(true)

  const [createCategory, { isLoading: creating }] = useCreateExpenseCategoryMutation()
  const [updateCategory, { isLoading: updating }] = useUpdateExpenseCategoryMutation()
  const saving = creating || updating

  const { data: postingData } = useGetPostingAccountsQuery({ rootType: 'EXPENSE' }, { skip: !open || !canSeeChart })
  const postingAccounts: PostingAccount[] = useMemo(() => {
    const list = (postingData as { data?: PostingAccount[] } | undefined)?.data
    return Array.isArray(list) ? list : []
  }, [postingData])
  // Cost of Sales heads (51xx) are where direct costs belong; everything else is operating.
  // COGS itself (5101) is posted by sales automatically and isn't offered.
  const directAccounts = postingAccounts.filter((a) => a.code.startsWith('51') && a.code !== '5101')
  const indirectAccounts = postingAccounts.filter((a) => !a.code.startsWith('51'))
  const shownAccounts = nature === 'direct' ? directAccounts : indirectAccounts

  useEffect(() => {
    if (!open) return
    setName(category?.name ?? initialName)
    setNature(category ? expenseNatureOf(category) : initialNature)
    setAccountCode(category?.accountCode || DEFAULT_ACCOUNT)
    setColor(category?.color || PALETTE[Math.floor(Math.random() * PALETTE.length)])
    setDescription(category?.description || '')
    setApplyToExisting(true)
  }, [open, category, initialName, initialNature])

  // A mapped account that no longer fits the chosen type is dropped back to the default.
  useEffect(() => {
    if (accountCode === DEFAULT_ACCOUNT || postingAccounts.length === 0) return
    if (!shownAccounts.some((a) => a.code === accountCode)) setAccountCode(DEFAULT_ACCOUNT)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nature, postingAccounts.length])

  const classificationChanged =
    isEdit &&
    (nature !== expenseNatureOf(category) || (accountCode === DEFAULT_ACCOUNT ? null : accountCode) !== (category?.accountCode || null))

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const payload = {
      name: trimmed,
      color,
      expenseNature: nature,
      description: description.trim(),
      ...(canSeeChart ? { accountCode: accountCode === DEFAULT_ACCOUNT ? '' : accountCode } : {}),
    }
    try {
      if (isEdit && category) {
        const id = category.id || category._id || ''
        const saved = await updateCategory({
          id,
          transactionType: 'business_expense',
          ...payload,
          applyToExisting,
        }).unwrap()
        if (saved.reclassified && saved.reclassified.updated > 0) {
          toast.success(
            t('Category updated — {{count}} existing expenses moved to {{type}}', {
              count: saved.reclassified.updated,
              type: t(nature === 'direct' ? 'Direct' : 'Indirect'),
            }),
          )
        } else {
          toast.success(t('Category updated'))
        }
        onSaved?.(saved, { renamedFrom: category.name !== trimmed ? category.name : undefined })
      } else {
        const saved = await createCategory({ transactionType: 'business_expense', ...payload }).unwrap()
        toast.success(t('Category created'))
        onSaved?.(saved, {})
      }
      onOpenChange(false)
    } catch (err: unknown) {
      const message = (err as { data?: { message?: string } })?.data?.message
      toast.error(message || t(isEdit ? 'Failed to update category' : 'Failed to create category'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[92vh] flex-col sm:max-w-lg'>
        <DialogHeader className='shrink-0'>
          <DialogTitle>{t(isEdit ? 'Edit expense category' : 'New expense category')}</DialogTitle>
          <DialogDescription>
            {t('The type decides where this cost shows in Profit & Loss and the Chart of Accounts.')}
          </DialogDescription>
        </DialogHeader>

        <div className='min-h-0 flex-1 space-y-4 overflow-y-auto py-1'>
          <div className='space-y-2'>
            <Label htmlFor='expense-cat-name'>{t('Name')}</Label>
            <Input
              id='expense-cat-name'
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSave()
                }
              }}
              placeholder={t('e.g. Freight Inward')}
            />
          </div>

          <div className='space-y-2'>
            <Label>{t('Expense type')}</Label>
            <ExpenseNaturePicker value={nature} onChange={setNature} />
          </div>

          {canSeeChart && (
            <div className='space-y-2'>
              <Label>{t('Posts to account')}</Label>
              <Select value={accountCode} onValueChange={setAccountCode}>
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_ACCOUNT}>
                    {nature === 'direct'
                      ? t('Default — Direct Expenses (Cost of Sales)')
                      : t('Default — Miscellaneous Expense')}
                  </SelectItem>
                  {shownAccounts.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>{t(nature === 'direct' ? 'Cost of Sales accounts' : 'Expense accounts')}</SelectLabel>
                      {shownAccounts.map((a) => (
                        <SelectItem key={a._id} value={a.code}>
                          {a.code} · {a.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
              <p className='text-muted-foreground text-xs'>
                {t('Optional. Pick a ledger from your Chart of Accounts to keep this cost on its own line in the books.')}
              </p>
            </div>
          )}

          <div className='grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3'>
            <div className='space-y-2'>
              <Label htmlFor='expense-cat-color'>{t('Color')}</Label>
              <Input
                id='expense-cat-color'
                type='color'
                className='h-9 w-16 cursor-pointer p-1'
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='expense-cat-desc'>{t('Note')}</Label>
              <Textarea
                id='expense-cat-desc'
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('What goes in this category (optional)')}
              />
            </div>
          </div>

          {classificationChanged && (
            <label className='bg-muted/50 flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm'>
              <Checkbox
                checked={applyToExisting}
                onCheckedChange={(v) => setApplyToExisting(v === true)}
                className='mt-0.5'
              />
              <span>
                <span className='font-medium'>{t('Also move expenses already saved in this category')}</span>
                <span className='text-muted-foreground block text-xs'>
                  {applyToExisting
                    ? t('Past reports and the books are re-classified too. Recommended.')
                    : t('Only expenses saved from now on use the new type — past figures stay as they were.')}
                </span>
              </span>
            </label>
          )}
        </div>

        <DialogFooter className='shrink-0 gap-2 sm:gap-0'>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)} disabled={saving}>
            {t('Cancel')}
          </Button>
          <Button type='button' onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {t(isEdit ? 'save_changes' : 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
