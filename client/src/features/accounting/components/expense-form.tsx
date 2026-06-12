import { useState } from 'react'
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
import { format } from 'date-fns'
import { useLanguage } from '@/context/language-context'
import { toast } from 'sonner'
import Axios from '@/utils/Axios'
import summery from '@/utils/summery'
import { cn } from '@/lib/utils'
import {
  useGetExpenseCategoriesQuery,
  useCreateExpenseCategoryMutation,
  useUpdateExpenseCategoryMutation,
  useDeleteExpenseCategoryMutation,
  type ExpenseCategory,
} from '@/stores/expenseCategory.api'
import {
  Dialog,
  DialogContent,
  DialogFooter,
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

interface ExpenseFormProps {
  expense?: any
  defaultCategory?: string
  onSave: () => void
  onCancel: () => void
  isEdit?: boolean
}

const paymentMethods = ['Cash', 'Bank Transfer', 'Card', 'Cheque']

export function ExpenseForm({ expense, defaultCategory, onSave, onCancel, isEdit = false }: ExpenseFormProps) {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [catOpen, setCatOpen] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [creatingCat, setCreatingCat] = useState(false)

  const { data: categories = [], refetch } = useGetExpenseCategoriesQuery({
    transactionType: 'business_expense',
  })
  const [createCategory] = useCreateExpenseCategoryMutation()
  const [updateCategory] = useUpdateExpenseCategoryMutation()
  const [deleteCategoryMut] = useDeleteExpenseCategoryMutation()

  const [categoryEditor, setCategoryEditor] = useState<ExpenseCategory | null>(null)
  const [editCatName, setEditCatName] = useState('')
  const [editCatColor, setEditCatColor] = useState('#6366f1')
  const [savingCat, setSavingCat] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState<ExpenseCategory | null>(null)
  const [deletingCat, setDeletingCat] = useState(false)

  const [formData, setFormData] = useState({
    category: expense?.category || defaultCategory || '',
    description: expense?.description || '',
    amount: expense?.amount || '',
    paymentMethod: expense?.paymentMethod || 'Cash',
    date: expense?.date ? new Date(expense.date) : new Date(),
    vendor: expense?.vendor || '',
    reference: expense?.reference || '',
    notes: expense?.notes || '',
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
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const openEditCategory = (cat: ExpenseCategory) => {
    const safeCategory = {
      ...cat,
      id: (cat as ExpenseCategory & { _id?: string }).id || (cat as ExpenseCategory & { _id?: string })._id || '',
    }
    setCategoryEditor(safeCategory)
    setEditCatName(cat.name)
    setEditCatColor(cat.color || '#6366f1')
  }

  const handleSaveCategoryEdit = async () => {
    if (!categoryEditor) return
    const name = editCatName.trim()
    if (!name) return
    setSavingCat(true)
    try {
      if (!categoryEditor.id) {
        toast.error(t('Failed to update category'))
        return
      }
      await updateCategory({ id: categoryEditor.id, name, color: editCatColor }).unwrap()
      if (formData.category === categoryEditor.name) {
        handleChange('category', name)
      }
      toast.success(t('Category updated'))
      refetch()
      setCategoryEditor(null)
    } catch (err: any) {
      toast.error(err?.data?.message || t('Failed to update category'))
    } finally {
      setSavingCat(false)
    }
  }

  const handleConfirmDeleteCategory = async () => {
    if (!categoryToDelete) return
    setDeletingCat(true)
    try {
      const categoryId = categoryToDelete.id || (categoryToDelete as ExpenseCategory & { _id?: string })._id
      if (!categoryId) {
        toast.error(t('Failed to delete category'))
        return
      }
      await deleteCategoryMut({
        id: categoryId,
        transactionType: 'business_expense',
      }).unwrap()
      if (formData.category === categoryToDelete.name) {
        handleChange('category', '')
      }
      toast.success(t('Category deleted'))
      refetch()
      setCategoryToDelete(null)
    } catch (err: any) {
      toast.error(err?.data?.message || t('Failed to delete category'))
    } finally {
      setDeletingCat(false)
    }
  }

  const handleCreateCategory = async () => {
    const name = newCatName.trim()
    if (!name) return
    setCreatingCat(true)
    try {
      const created = await createCategory({
        name,
        color: '#6366f1',
        transactionType: 'business_expense',
      }).unwrap()
      handleChange('category', created.name)
      setNewCatName('')
      setCatOpen(false)
      toast.success(t('Category created'))
      refetch()
    } catch (err: any) {
      toast.error(err?.data?.message || t('Failed to create category'))
    } finally {
      setCreatingCat(false)
    }
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
        date: formData.date.toISOString(),
        vendor: formData.vendor || undefined,
        reference: formData.reference || undefined,
        notes: formData.notes || undefined,
      }
      if (isEdit && expense?.id) {
        await Axios({ ...summery.updateExpense, url: `${summery.updateExpense.url}/${expense.id}`, data: payload })
        toast.success(t('Expense updated successfully'))
      } else {
        await Axios({ ...summery.addExpense, data: payload })
        toast.success(t('Expense created successfully'))
      }
      onSave()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || t('Failed to save expense'))
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
                    {formData.category || <span className="text-muted-foreground">{t('Select category')}</span>}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command className="max-h-80 overflow-hidden">
                    <CommandInput placeholder={t('Search or create category...')} />
                    <CommandEmpty>{t('No categories found')}</CommandEmpty>
                    <CommandList className="max-h-52 overflow-y-auto">
                    <CommandGroup heading={t('Categories')}>
                      {categories.map((cat) => (
                        <CommandItem
                          key={cat.id}
                          value={`${cat.name} ${cat.id}`}
                          onSelect={() => {
                            handleChange('category', cat.name)
                            setCatOpen(false)
                          }}
                        >
                          <div className="flex w-full min-w-0 items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: cat.color }}
                            />
                            <span className="flex-1 truncate">{cat.name}</span>
                            {formData.category === cat.name && (
                              <Check className="h-4 w-4 shrink-0 text-primary" />
                            )}
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
                              {!cat.isDefault && (
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
                                    setCategoryToDelete(cat)
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
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
                          disabled={creatingCat || !newCatName.trim()}
                        >
                          {creatingCat ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        </Button>
                      </div>
                    </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {errors.category && <p className="text-sm text-red-500">{errors.category}</p>}
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

            {/* Payment Method */}
            <div className="space-y-2">
              <Label>{t('Payment Method')}</Label>
              <Select value={formData.paymentMethod} onValueChange={(v) => handleChange('paymentMethod', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((m) => (
                    <SelectItem key={m} value={m}>{t(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                    {formData.date ? format(formData.date, 'PPP') : <span>{t('Pick a date')}</span>}
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
            <Button type="submit" disabled={loading}>
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('Saving...')}</>
              ) : (
                <><Save className="h-4 w-4 mr-2" />{isEdit ? t('Update') : t('Create')}</>
              )}
            </Button>
          </div>
        </form>

        <Dialog open={!!categoryEditor} onOpenChange={(open) => !open && setCategoryEditor(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('Edit category')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="edit-cat-name">{t('Name')}</Label>
                <Input
                  id="edit-cat-name"
                  value={editCatName}
                  onChange={(e) => setEditCatName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleSaveCategoryEdit()
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cat-color">{t('Color')}</Label>
                <Input
                  id="edit-cat-color"
                  type="color"
                  className="h-10 w-full cursor-pointer p-1"
                  value={editCatColor}
                  onChange={(e) => setEditCatColor(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setCategoryEditor(null)}>
                {t('Cancel')}
              </Button>
              <Button type="button" onClick={handleSaveCategoryEdit} disabled={savingCat || !editCatName.trim()}>
                {savingCat ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('Saving...')}
                  </>
                ) : (
                  t('save_changes')
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={!!categoryToDelete}
          onOpenChange={(open) => !open && setCategoryToDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('Delete category?')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('This will remove the category from the list. Existing expenses keep their recorded category text.')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletingCat}>{t('Cancel')}</AlertDialogCancel>
              <Button
                type="button"
                variant="destructive"
                disabled={deletingCat}
                onClick={() => handleConfirmDeleteCategory()}
              >
                {deletingCat ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t('delete')}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
