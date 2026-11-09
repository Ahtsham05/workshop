import { useState } from 'react'
import { useCreateExpenseMutation, useUpdateExpenseMutation } from '@/stores/expense.api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { CalendarIcon, Loader2, Save, X, Plus, Check, ChevronsUpDown, Pencil, Trash2 } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  expenseNatureOf,
  useGetExpenseCategoriesQuery,
  type ExpenseCategory,
} from '@/stores/expenseCategory.api'
import { ExpenseCategoryEditorDialog } from './expense-category-editor-dialog'
import { DeleteExpenseCategoryDialog } from './delete-expense-category-dialog'
import { ExpenseCategoryIcon } from './expense-category-icon'
import { ExpenseNatureBadge, EXPENSE_NATURE_HELP } from './expense-nature'
import { useGetWalletsQuery } from '@/stores/mobile-shop.api'
import { useCurrencyMeta } from '@/lib/format-money'
import {
  buildMergedPaymentOptions,
  getWalletTypeFromOptionValue,
  isWalletOptionValue,
  toWalletOptionValue,
} from '@/lib/wallet-payment-options'
import { useStateDraft } from '@/hooks/use-form-draft'
import { FormDraftNotice } from '@/components/form-draft-notice'
import { formatAppDate } from '@/lib/date-format'

interface ExpenseFormProps {
  expense?: any
  defaultCategory?: string
  onSave: () => void
  onCancel: () => void
  onCategoryUpdated?: () => void
  isEdit?: boolean
}

// No generic 'Bank Transfer'/'Card'/'Cheque' placeholders — every real account (Cash in
// Hand or a named Bank Account/mobile wallet) is selectable by its own name via
// buildMergedPaymentOptions below. The server's Joi enum still tolerates the old values on
// existing/edited expense records — see expense.validation.js — only the offered UI list
// is narrowed.
const paymentMethods = ['Cash']

export function ExpenseForm({
  expense,
  defaultCategory,
  onSave,
  onCancel,
  onCategoryUpdated,
  isEdit = false,
}: ExpenseFormProps) {
  const { t } = useLanguage()
  const { hasExplicitPermission } = usePermissions()
  const canManageExpenses = hasExplicitPermission('manageExpenses')
  const [createExpense] = useCreateExpenseMutation()
  const [updateExpense] = useUpdateExpenseMutation()
  const currencyMeta = useCurrencyMeta()
  const [loading, setLoading] = useState(false)
  const [catOpen, setCatOpen] = useState(false)
  const [newCatName, setNewCatName] = useState('')

  const { data: categories = [], refetch } = useGetExpenseCategoriesQuery({
    transactionType: 'business_expense',
  })
  const { data: walletsData } = useGetWalletsQuery()
  const wallets = walletsData?.results?.filter((w) => w.isActive) ?? []
  // Expenses are always money-out — show wallet balances so the user can avoid overdrawing.
  const mergedPaymentMethods = buildMergedPaymentOptions(
    paymentMethods.map((m) => ({ value: m, label: t(m) })),
    wallets,
    true,
    currencyMeta,
  )

  // null = closed; { category } = edit; { category: null } = create (name from the search box)
  const [categoryEditor, setCategoryEditor] = useState<{ category: ExpenseCategory | null; name?: string } | null>(null)
  const [categoryToDelete, setCategoryToDelete] = useState<ExpenseCategory | null>(null)

  const [formData, setFormData] = useState({
    category: expense?.category || defaultCategory || '',
    description: expense?.description || '',
    amount: expense?.amount || '',
    paymentMethod: expense?.paymentMethod || 'Cash',
    walletType: expense?.walletType || '',
    date: expense?.date ? new Date(expense.date) : new Date(),
    vendor: expense?.vendor || '',
    reference: expense?.reference || '',
    notes: expense?.notes || '',
  })

  // The form is mounted only while it's shown, so "enabled" is simply "creating". The date is
  // not restored — a draft picked up on a later day is dated that day.
  const draft = useStateDraft(formData, setFormData, {
    key: 'expense',
    enabled: !isEdit,
    label: 'expense',
    exclude: defaultCategory ? ['date', 'category'] : ['date'],
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }))
  }

  const validate = () => {
    const newErrors: Record<string, string> = {}
    if (!formData.category) newErrors.category = t('Category is required')
    if (!formData.description) newErrors.description = t('Description is required')
    if (!formData.amount || Number(formData.amount) <= 0)
      newErrors.amount = t('Amount must be greater than 0')
    if (formData.paymentMethod === 'Wallet' && !formData.walletType)
      newErrors.walletType = t('Please select a wallet')
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const openEditCategory = (cat: ExpenseCategory) => {
    const safeCategory = {
      ...cat,
      id: (cat as ExpenseCategory & { _id?: string }).id || (cat as ExpenseCategory & { _id?: string })._id || '',
    }
    setCategoryEditor({ category: safeCategory })
  }

  // Inactive (retired) categories aren't offered for new expenses — but an expense being
  // edited keeps showing the one it already has.
  const pickerCategories = categories.filter(
    (c) => c.isActive !== false || c.name.trim().toLowerCase() === String(formData.category || '').trim().toLowerCase(),
  )

  const selectedCategory = categories.find(
    (c) => c.name.trim().toLowerCase() === String(formData.category || '').trim().toLowerCase(),
  )
  const selectedNature = selectedCategory ? expenseNatureOf(selectedCategory) : null

  const handleCreateCategory = () => {
    const name = newCatName.trim()
    if (!name) return
    setCatOpen(false)
    setCategoryEditor({ category: null, name })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      const payload = {
        category: formData.category,
        description: formData.description,
        amount: Number(formData.amount),
        paymentMethod: formData.paymentMethod,
        walletType: formData.paymentMethod === 'Wallet' ? formData.walletType : undefined,
        date: formData.date.toISOString(),
        vendor: formData.vendor || undefined,
        reference: formData.reference || undefined,
        notes: formData.notes || undefined,
      }
      // The mutations refresh the expense list, reports, cash book and bank balances.
      if (isEdit && expense?.id) {
        await updateExpense({ id: expense.id, ...payload }).unwrap()
        toast.success(t('Expense updated successfully'))
      } else {
        await createExpense(payload).unwrap()
        draft.clear()
        toast.success(t('Expense created successfully'))
      }
      onSave()
    } catch (error: any) {
      toast.error(error?.data?.message || error?.response?.data?.message || t('Failed to save expense'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEdit ? t('Edit Expense') : t('Create New Expense')}</CardTitle>
      </CardHeader>
      <CardContent>
        <FormDraftNotice draft={draft} className='mb-4' />
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Dynamic Category Combobox */}
            <div className="space-y-2">
              <Label>
                {t('Category')} <span className="text-red-500">*</span>
              </Label>
              <Popover open={catOpen} onOpenChange={setCatOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={catOpen}
                    className={cn('w-full justify-between font-normal', errors.category && 'border-red-500')}
                  >
                    {formData.category ? (
                      <span className="flex min-w-0 items-center gap-2">
                        <ExpenseCategoryIcon name={formData.category} color={selectedCategory?.color} size="sm" className="h-6 w-6" />
                        <span className="truncate">{formData.category}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t('Select category')}</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command className="max-h-80 overflow-hidden">
                    <CommandInput placeholder={t('Search or create category...')} />
                    <CommandEmpty>{t('No categories found')}</CommandEmpty>
                    <CommandList className="max-h-52 overflow-y-auto">
                    <CommandGroup heading={t('Categories')}>
                      {pickerCategories.map((cat) => (
                        <CommandItem
                          key={cat.id}
                          value={`${cat.name} ${cat.id}`}
                          onSelect={() => {
                            handleChange('category', cat.name)
                            setCatOpen(false)
                          }}
                        >
                          <div className="flex w-full min-w-0 items-center gap-2">
                            <ExpenseCategoryIcon name={cat.name} color={cat.color} size="sm" className="h-6 w-6" />
                            <span className="flex-1 truncate">{cat.name}</span>
                            <ExpenseNatureBadge nature={expenseNatureOf(cat)} compact />
                            {formData.category === cat.name && (
                              <Check className="h-4 w-4 shrink-0 text-primary" />
                            )}
                            {canManageExpenses && (
                              <div
                                className="flex shrink-0 items-center gap-0.5"
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                }}
                              >
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  title={t('Edit category')}
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    setCatOpen(false)
                                    openEditCategory(cat)
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    title={t('Delete category')}
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      setCatOpen(false)
                                      setCategoryToDelete({ ...cat, id: cat.id || (cat as ExpenseCategory & { _id?: string })._id || '' })
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                              </div>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    {canManageExpenses && (
                      <>
                        <CommandSeparator />
                        <CommandGroup heading={t('Create new')}>
                          <div className="flex items-center gap-2 px-2 py-1.5">
                            <Input
                              value={newCatName}
                              onChange={(e) => setNewCatName(e.target.value)}
                              placeholder={t('New category name')}
                              className="h-7 text-sm"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); handleCreateCategory() }
                              }}
                            />
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 px-2 shrink-0"
                              onClick={handleCreateCategory}
                              disabled={!newCatName.trim()}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </CommandGroup>
                      </>
                    )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {errors.category && <p className="text-sm text-red-500">{errors.category}</p>}
              {selectedNature && !errors.category && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <ExpenseNatureBadge nature={selectedNature} compact />
                  <span>{t(EXPENSE_NATURE_HELP[selectedNature])}</span>
                </div>
              )}
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label>
                {t('Amount')} <span className="text-red-500">*</span>
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => handleChange('amount', e.target.value)}
                className={errors.amount ? 'border-red-500' : ''}
                placeholder="0.00"
              />
              {errors.amount && <p className="text-sm text-red-500">{errors.amount}</p>}
            </div>

            {/* Payment Method — expenses are always money-out, so wallet balances are shown */}
            <div className="space-y-2">
              <Label>{t('Payment Method')}</Label>
              <Select
                value={
                  formData.paymentMethod === 'Wallet' && formData.walletType
                    ? toWalletOptionValue(formData.walletType)
                    : formData.paymentMethod
                }
                onValueChange={(v) => {
                  if (isWalletOptionValue(v)) {
                    setFormData((prev) => ({ ...prev, paymentMethod: 'Wallet', walletType: getWalletTypeFromOptionValue(v) }))
                  } else {
                    setFormData((prev) => ({ ...prev, paymentMethod: v, walletType: '' }))
                  }
                  if (errors.walletType) setErrors((prev) => ({ ...prev, walletType: '' }))
                }}
              >
                <SelectTrigger className={cn('w-full', errors.walletType && 'border-red-500')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mergedPaymentMethods.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {wallets.length === 0 && (
                <p className="text-xs text-muted-foreground">{t('No wallets configured. Add one from the Wallet page.')}</p>
              )}
              {errors.walletType && <p className="text-sm text-red-500">{errors.walletType}</p>}
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label>{t('Date')}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn('w-full justify-start text-left font-normal', !formData.date && 'text-muted-foreground')}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.date ? formatAppDate(formData.date) : <span>{t('Pick a date')}</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.date}
                    onSelect={(d) => handleChange('date', d || new Date())}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Vendor */}
            <div className="space-y-2">
              <Label>{t('Vendor')}</Label>
              <Input
                value={formData.vendor}
                onChange={(e) => handleChange('vendor', e.target.value)}
                placeholder={t('Vendor name')}
              />
            </div>

            {/* Reference */}
            <div className="space-y-2">
              <Label>{t('Reference')}</Label>
              <Input
                value={formData.reference}
                onChange={(e) => handleChange('reference', e.target.value)}
                placeholder={t('Invoice/Receipt number')}
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>
              {t('Description')} <span className="text-red-500">*</span>
            </Label>
            <Input
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              className={errors.description ? 'border-red-500' : ''}
              placeholder={t('Brief description of the expense')}
            />
            {errors.description && <p className="text-sm text-red-500">{errors.description}</p>}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>{t('Notes')}</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder={t('Additional notes')}
              rows={3}
            />
          </div>

          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
              <X className="h-4 w-4 mr-2" />
              {t('Cancel')}
            </Button>
            {canManageExpenses && (
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('Saving...')}</>
                ) : (
                  <><Save className="h-4 w-4 mr-2" />{isEdit ? t('Update') : t('Create')}</>
                )}
              </Button>
            )}
          </div>
        </form>

        <ExpenseCategoryEditorDialog
          open={!!categoryEditor}
          onOpenChange={(open) => !open && setCategoryEditor(null)}
          category={categoryEditor?.category ?? null}
          initialName={categoryEditor?.name}
          onSaved={(saved, { renamedFrom }) => {
            if (!categoryEditor?.category) {
              // New category from the picker — select it and clear the search box.
              handleChange('category', saved.name)
              setNewCatName('')
            } else if (renamedFrom && formData.category === renamedFrom) {
              handleChange('category', saved.name)
            }
            refetch()
            onCategoryUpdated?.()
          }}
        />

        <DeleteExpenseCategoryDialog
          category={categoryToDelete}
          onOpenChange={(open) => !open && setCategoryToDelete(null)}
          onDeleted={({ name, movedTo }) => {
            if (formData.category === name) handleChange('category', movedTo || '')
            refetch()
            onCategoryUpdated?.()
          }}
        />
      </CardContent>
    </Card>
  )
}
