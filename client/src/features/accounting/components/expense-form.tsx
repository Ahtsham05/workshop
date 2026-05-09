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
import { CalendarIcon, Loader2, Save, X, Plus, Check, ChevronsUpDown } from 'lucide-react'
import { format } from 'date-fns'
import { useLanguage } from '@/context/language-context'
import { toast } from 'sonner'
import Axios from '@/utils/Axios'
import summery from '@/utils/summery'
import { cn } from '@/lib/utils'
import {
  useGetExpenseCategoriesQuery,
  useCreateExpenseCategoryMutation,
} from '@/stores/expenseCategory.api'

interface ExpenseFormProps {
  expense?: any
  onSave: () => void
  onCancel: () => void
  isEdit?: boolean
}

const paymentMethods = ['Cash', 'Bank Transfer', 'Card', 'Cheque']

export function ExpenseForm({ expense, onSave, onCancel, isEdit = false }: ExpenseFormProps) {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [catOpen, setCatOpen] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [creatingCat, setCreatingCat] = useState(false)

  const { data: categories = [], refetch } = useGetExpenseCategoriesQuery()
  const [createCategory] = useCreateExpenseCategoryMutation()

  const [formData, setFormData] = useState({
    category: expense?.category || '',
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

  const handleCreateCategory = async () => {
    const name = newCatName.trim()
    if (!name) return
    setCreatingCat(true)
    try {
      const created = await createCategory({ name }).unwrap()
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
                          value={cat.name}
                          onSelect={() => {
                            handleChange('category', cat.name)
                            setCatOpen(false)
                          }}
                        >
                          <span
                            className="mr-2 h-2.5 w-2.5 rounded-full inline-block"
                            style={{ backgroundColor: cat.color }}
                          />
                          {cat.name}
                          {formData.category === cat.name && (
                            <Check className="ml-auto h-4 w-4 text-primary" />
                          )}
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
      </CardContent>
    </Card>
  )
}
