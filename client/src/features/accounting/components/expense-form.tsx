import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2, Save, X } from 'lucide-react';
import { format } from 'date-fns';
import { useLanguage } from '@/context/language-context';
import { toast } from 'sonner';
import Axios from '@/utils/Axios';
import summery from '@/utils/summery';
import { cn } from '@/lib/utils';

interface ExpenseFormProps {
  expense?: any;
  onSave: () => void;
  onCancel: () => void;
  isEdit?: boolean;
}

const expenseCategories = [
  'Rent',
  'Utilities',
  'Salaries',
  'Transportation',
  'Marketing',
  'Supplies',
  'Maintenance',
  'Insurance',
  'Tax',
  'Other'
];

const paymentMethods = ['Cash', 'Bank Transfer', 'Card', 'Cheque'];

export function ExpenseForm({ expense, onSave, onCancel, isEdit = false }: ExpenseFormProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    category: expense?.category || '',
    description: expense?.description || '',
    amount: expense?.amount || '',
    paymentMethod: expense?.paymentMethod || 'Cash',
    date: expense?.date ? new Date(expense.date) : new Date(),
    vendor: expense?.vendor || '',
    reference: expense?.reference || '',
    notes: expense?.notes || '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.category) {
      newErrors.category = t('Category is required');
    }
    if (!formData.description) {
      newErrors.description = t('Description is required');
    }
    if (!formData.amount || Number(formData.amount) <= 0) {
      newErrors.amount = t('Amount must be greater than 0');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setLoading(true);

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
      };

      if (isEdit && expense?.id) {
        await Axios({
          ...summery.updateExpense,
          url: `${summery.updateExpense.url}/${expense.id}`,
          data: payload,
        });
        toast.success(t('Expense updated successfully'));
      } else {
        await Axios({
          ...summery.addExpense,
          data: payload,
        });
        toast.success(t('Expense created successfully'));
      }

      onSave();
    } catch (error: any) {
      console.error('Error saving expense:', error);
      toast.error(error?.response?.data?.message || t('Failed to save expense'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isEdit ? t('Edit Expense') : t('Create New Expense')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="category">
                {t('Category')} <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.category}
                onValueChange={(value) => handleChange('category', value)}
              >
                <SelectTrigger className={errors.category ? 'border-red-500' : ''}>
                  <SelectValue placeholder={t('Select category')} />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {t(cat)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category && (
                <p className="text-sm text-red-500">{errors.category}</p>
              )}
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">
                {t('Amount')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => handleChange('amount', e.target.value)}
                className={errors.amount ? 'border-red-500' : ''}
                placeholder="0.00"
              />
              {errors.amount && (
                <p className="text-sm text-red-500">{errors.amount}</p>
              )}
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">{t('Payment Method')}</Label>
              <Select
                value={formData.paymentMethod}
                onValueChange={(value) => handleChange('paymentMethod', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((method) => (
                    <SelectItem key={method} value={method}>
                      {t(method)}
                    </SelectItem>
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
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !formData.date && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.date ? format(formData.date, 'PPP') : <span>{t('Pick a date')}</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.date}
                    onSelect={(date) => handleChange('date', date || new Date())}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Vendor */}
            <div className="space-y-2">
              <Label htmlFor="vendor">{t('Vendor')}</Label>
              <Input
                id="vendor"
                value={formData.vendor}
                onChange={(e) => handleChange('vendor', e.target.value)}
                placeholder={t('Vendor name')}
              />
            </div>

            {/* Reference */}
            <div className="space-y-2">
              <Label htmlFor="reference">{t('Reference')}</Label>
              <Input
                id="reference"
                value={formData.reference}
                onChange={(e) => handleChange('reference', e.target.value)}
                placeholder={t('Invoice/Receipt number')}
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">
              {t('Description')} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              className={errors.description ? 'border-red-500' : ''}
              placeholder={t('Brief description of the expense')}
            />
            {errors.description && (
              <p className="text-sm text-red-500">{errors.description}</p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">{t('Notes')}</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder={t('Additional notes')}
              rows={3}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
              <X className="h-4 w-4 mr-2" />
              {t('Cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('Saving...')}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {isEdit ? t('Update') : t('Create')}
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
