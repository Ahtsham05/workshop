import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/context/language-context';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import Axios from '@/utils/Axios';
import summery from '@/utils/summery';

interface LedgerEntryFormProps {
  ledgerType: 'customer' | 'supplier';
  entityId: string;
  entityName: string;
  editingEntry?: any;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function LedgerEntryForm({
  ledgerType,
  entityId,
  entityName,
  editingEntry,
  onSuccess,
  onCancel,
}: LedgerEntryFormProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState<Date>(editingEntry ? new Date(editingEntry.transactionDate) : new Date());
  
  // Store the entry ID separately to ensure it doesn't get lost
  // Note: Backend returns 'id' not '_id'
  const [entryId] = useState(editingEntry?.id || editingEntry?._id);
  
  const [formData, setFormData] = useState({
    transactionType: editingEntry?.transactionType || (ledgerType === 'customer' ? 'payment_received' : 'payment_made'),
    description: editingEntry?.description || '',
    reference: editingEntry?.reference || '',
    debit: editingEntry?.debit ? editingEntry.debit.toString() : '',
    credit: editingEntry?.credit ? editingEntry.credit.toString() : '',
    paymentMethod: editingEntry?.paymentMethod || '',
    notes: editingEntry?.notes || '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const customerTransactionTypes = [
    { value: 'sale', label: t('Sale') },
    { value: 'payment_received', label: t('Payment Received') },
    { value: 'credit_note', label: t('Credit Note') },
    { value: 'debit_note', label: t('Debit Note') },
    { value: 'adjustment', label: t('Adjustment') },
    { value: 'opening_balance', label: t('Opening Balance') },
  ];

  const supplierTransactionTypes = [
    { value: 'purchase', label: t('Purchase') },
    { value: 'payment_made', label: t('Payment Made') },
    { value: 'purchase_return', label: t('Purchase Return') },
    { value: 'debit_note', label: t('Debit Note') },
    { value: 'credit_note', label: t('Credit Note') },
    { value: 'adjustment', label: t('Adjustment') },
    { value: 'opening_balance', label: t('Opening Balance') },
  ];

  const paymentMethods = [
    { value: 'Cash', label: t('Cash') },
    { value: 'Bank Transfer', label: t('Bank Transfer') },
    { value: 'Cheque', label: t('Cheque') },
    { value: 'Card', label: t('Card') },
    { value: 'Credit', label: t('Credit') },
  ];

  const transactionTypes = ledgerType === 'customer' ? customerTransactionTypes : supplierTransactionTypes;

  // Determine which field should be enabled based on transaction type
  const getFieldState = (transactionType: string) => {
    if (ledgerType === 'customer') {
      // For customer: sale/debit_note = debit, payment_received/credit_note = credit
      if (['sale', 'debit_note', 'opening_balance'].includes(transactionType)) {
        return { enableDebit: true, enableCredit: false };
      } else if (['payment_received', 'credit_note'].includes(transactionType)) {
        return { enableDebit: false, enableCredit: true };
      }
    } else {
      // For supplier: purchase/debit_note = credit, payment_made/credit_note = debit
      if (['purchase', 'credit_note', 'opening_balance'].includes(transactionType)) {
        return { enableDebit: false, enableCredit: true };
      } else if (['payment_made', 'debit_note', 'purchase_return'].includes(transactionType)) {
        return { enableDebit: true, enableCredit: false };
      }
    }
    return { enableDebit: true, enableCredit: true }; // For adjustment and others
  };

  const fieldState = getFieldState(formData.transactionType);

  // Auto-clear disabled field when transaction type changes
  const handleTransactionTypeChange = (value: string) => {
    const newFieldState = getFieldState(value);
    setFormData({
      ...formData,
      transactionType: value,
      debit: newFieldState.enableDebit ? formData.debit : '',
      credit: newFieldState.enableCredit ? formData.credit : '',
    });
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.transactionType) newErrors.transactionType = t('Transaction type is required');
    if (!formData.description) newErrors.description = t('Description is required');
    
    const debit = parseFloat(formData.debit) || 0;
    const credit = parseFloat(formData.credit) || 0;
    
    if (debit === 0 && credit === 0) {
      newErrors.debit = t('Either debit or credit must be greater than 0');
      newErrors.credit = t('Either debit or credit must be greater than 0');
    }
    
    if (debit > 0 && credit > 0) {
      newErrors.debit = t('Cannot have both debit and credit in same entry');
      newErrors.credit = t('Cannot have both debit and credit in same entry');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      setLoading(true);

      if (entryId) {
        // Update existing entry - only send allowed fields
        console.log('Editing entry ID:', entryId);
        
        const updatePayload = {
          transactionDate: date.toISOString(),
          description: formData.description,
          reference: formData.reference || undefined,
          paymentMethod: formData.paymentMethod || undefined,
          notes: formData.notes || undefined,
        };

        const url = ledgerType === 'customer'
          ? `${summery.updateCustomerLedgerEntry.url}/${entryId}`
          : `${summery.updateSupplierLedgerEntry.url}/${entryId}`;

        console.log('Update URL:', url);
        console.log('Update payload:', updatePayload);

        await Axios.patch(url, updatePayload);
        toast.success(t('Ledger entry updated successfully'));
      } else {
        // Create new entry - send full payload
        const createPayload = {
          [ledgerType]: entityId,
          transactionType: formData.transactionType,
          transactionDate: date.toISOString(),
          description: formData.description,
          reference: formData.reference || undefined,
          debit: parseFloat(formData.debit) || 0,
          credit: parseFloat(formData.credit) || 0,
          paymentMethod: formData.paymentMethod || undefined,
          notes: formData.notes || undefined,
        };

        const url = ledgerType === 'customer'
          ? summery.addCustomerLedgerEntry.url
          : summery.addSupplierLedgerEntry.url;

        await Axios.post(url, createPayload);
        toast.success(t('Ledger entry added successfully'));
      }
      
      if (onSuccess) onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('Failed to add ledger entry'));
      console.error('Error adding ledger entry:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="transactionType" className={entryId ? 'text-gray-400' : ''}>
                {t('Transaction Type')} *
              </Label>
              <Select
                value={formData.transactionType}
                onValueChange={handleTransactionTypeChange}
                disabled={!!entryId}
              >
                <SelectTrigger className={entryId ? 'bg-gray-100 cursor-not-allowed' : ''}>
                  <SelectValue placeholder={t('Select type')} />
                </SelectTrigger>
                <SelectContent>
                  {transactionTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.transactionType && (
                <p className="text-sm text-red-600">{errors.transactionType}</p>
              )}
              {entryId && (
                <p className="text-xs text-gray-500">{t('Transaction type cannot be changed')}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">{t('Date')} *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(date, 'PPP')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('Description')} *</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={t('Enter description')}
            />
            {errors.description && (
              <p className="text-sm text-red-600">{errors.description}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reference">{t('Reference')}</Label>
              <Input
                id="reference"
                value={formData.reference}
                onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                placeholder={t('Reference number')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentMethod">{t('Payment Method')}</Label>
              <Select
                value={formData.paymentMethod}
                onValueChange={(value) =>
                  setFormData({ ...formData, paymentMethod: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('Select method')} />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((method) => (
                    <SelectItem key={method.value} value={method.value}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="debit" className={!fieldState.enableDebit || entryId ? 'text-gray-400' : ''}>
                {t('Debit')}
              </Label>
              <Input
                id="debit"
                type="number"
                step="0.01"
                min="0"
                value={formData.debit}
                onChange={(e) => setFormData({ ...formData, debit: e.target.value })}
                placeholder="0.00"
                disabled={!fieldState.enableDebit || !!entryId}
                className={!fieldState.enableDebit || entryId ? 'bg-gray-100 cursor-not-allowed' : ''}
              />
              {errors.debit && <p className="text-sm text-red-600">{errors.debit}</p>}
              {entryId && formData.debit && (
                <p className="text-xs text-gray-500">{t('Amount cannot be changed')}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="credit" className={!fieldState.enableCredit || entryId ? 'text-gray-400' : ''}>
                {t('Credit')}
              </Label>
              <Input
                id="credit"
                type="number"
                step="0.01"
                min="0"
                value={formData.credit}
                onChange={(e) => setFormData({ ...formData, credit: e.target.value })}
                placeholder="0.00"
                disabled={!fieldState.enableCredit || !!entryId}
                className={!fieldState.enableCredit || entryId ? 'bg-gray-100 cursor-not-allowed' : ''}
              />
              {errors.credit && <p className="text-sm text-red-600">{errors.credit}</p>}
              {entryId && formData.credit && (
                <p className="text-xs text-gray-500">{t('Amount cannot be changed')}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t('Notes')}</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder={t('Additional notes')}
              rows={3}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                {t('Cancel')}
              </Button>
            )}
            <Button type="submit" disabled={loading}>
              {loading ? t('Saving...') : entryId ? t('Update Entry') : t('Save Entry')}
            </Button>
          </div>
        </form>
  );
}
