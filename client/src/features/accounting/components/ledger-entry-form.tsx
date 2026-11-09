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
import { toast } from 'sonner';
import Axios from '@/utils/Axios';
import summery from '@/utils/summery';
import { AppDispatch } from '@/stores/store';
import { useGetWalletsQuery } from '@/stores/mobile-shop.api';
import { useCurrencyMeta } from '@/lib/format-money';
import {
  buildMergedPaymentOptions,
  getWalletTypeFromOptionValue,
  isWalletOptionValue,
  toWalletOptionValue,
} from '@/lib/wallet-payment-options';
import { useDispatch } from 'react-redux';
import { mobileShopApi } from '@/stores/mobile-shop.api';
import { purchaseApi } from '@/stores/purchase.api';
import { supplierPaymentApi } from '@/stores/supplierPayment.api';
import { invoiceApi } from '@/stores/invoice.api';
import { customerPaymentApi } from '@/stores/customerPayment.api';
import { formatMoneyWithMeta } from '@/lib/format-money';
import { formatAppDate } from '@/lib/date-format'
import { ledgerDiscountsApi } from '@/stores/ledgerDiscounts.api'
import type { LedgerDiscountReason } from '@/stores/ledgerDiscounts.api'
import { useLedgerDiscountSettings } from '@/features/ledger-discounts/hooks/use-ledger-discount-settings'
import {
  DISCOUNT_REASONS,
  DISCOUNT_TYPE,
  discountReasonLabel,
  isDiscountType,
} from '@/features/ledger-discounts/lib/ledger-discounts'
import { SettlementDiscountFields } from '@/features/ledger-discounts/components/settlement-discount-fields'
import { emptyDiscountDraft, resolveDiscount, type DiscountDraft } from '@/features/ledger-discounts/lib/discount-draft'

interface LedgerEntryFormProps {
  ledgerType: 'customer' | 'supplier';
  entityId: string;
  entityName: string;
  editingEntry?: any;
  defaultTransactionType?: string;
  defaultPaymentMethod?: string;
  /** The party's balance now (customer: + = receivable, supplier: + = payable) — the discount ceiling. */
  currentBalance?: number | null;
  onSuccess?: (entry?: any) => void;
  onCancel?: () => void;
}

export function LedgerEntryForm({
  ledgerType,
  entityId,
  entityName,
  editingEntry,
  defaultTransactionType,
  defaultPaymentMethod,
  currentBalance,
  onSuccess,
  onCancel,
}: LedgerEntryFormProps) {
  const { t } = useLanguage();
  const dispatch = useDispatch<AppDispatch>();
  const currencyMeta = useCurrencyMeta();
  const { data: walletsData } = useGetWalletsQuery();
  const wallets = walletsData?.results?.filter((wallet) => wallet.isActive) ?? [];
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState<Date>(editingEntry ? new Date(editingEntry.transactionDate) : new Date());
  
  // Store the entry ID separately to ensure it doesn't get lost
  // Note: Backend returns 'id' not '_id'
  const [entryId] = useState(editingEntry?.id || editingEntry?._id);
  
  const getWalletTypeFromPaymentMethod = (paymentMethod?: string) => {
    const method = String(paymentMethod || '').trim();
    const match = method.match(/wallet\s*\((.+)\)/i);
    if (match && match[1]) return match[1].trim();
    return '';
  };

  const isWalletPaymentMethod = (paymentMethod?: string) => {
    const method = String(paymentMethod || '').toLowerCase();
    return method.includes('wallet');
  };

  const initialPaymentMethod = editingEntry?.paymentMethod || defaultPaymentMethod || 'Cash';

  const [formData, setFormData] = useState({
    transactionType: editingEntry?.transactionType || defaultTransactionType || (ledgerType === 'customer' ? 'payment_received' : 'payment_made'),
    description: editingEntry?.description || '',
    reference: editingEntry?.reference || '',
    debit: editingEntry?.debit ? editingEntry.debit.toString() : '',
    credit: editingEntry?.credit ? editingEntry.credit.toString() : '',
    paymentMethod: isWalletPaymentMethod(initialPaymentMethod) ? 'Wallet' : initialPaymentMethod,
    walletType: getWalletTypeFromPaymentMethod(initialPaymentMethod) || '',
    notes: editingEntry?.notes || '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Ledger discount (Discount Allowed / Received) ──
  const discountType = DISCOUNT_TYPE[ledgerType];
  const paymentType = ledgerType === 'customer' ? 'payment_received' : 'payment_made';
  const discountRules = useLedgerDiscountSettings(ledgerType);
  const [discountDraft, setDiscountDraft] = useState<DiscountDraft>(() =>
    emptyDiscountDraft((editingEntry?.discount?.reason as LedgerDiscountReason) || discountRules.settings.defaultReason),
  );
  const [editDiscountReason, setEditDiscountReason] = useState<string>(editingEntry?.discount?.reason || '');
  const outstanding = Math.max(0, Number(currentBalance) || 0);
  const isStandaloneDiscount = formData.transactionType === discountType;
  const showSettlementDiscount =
    !entryId && formData.transactionType === paymentType && discountRules.available;
  const paymentAmountForDiscount = ledgerType === 'customer' ? parseFloat(formData.credit) || 0 : parseFloat(formData.debit) || 0;
  const resolvedDiscount = resolveDiscount(discountDraft, {
    paymentAmount: isStandaloneDiscount ? 0 : paymentAmountForDiscount,
    outstanding,
    settings: discountRules.settings,
    canApprove: discountRules.canApprove,
    t,
  });

  const customerTransactionTypes = [
    { value: 'sale', label: t('Cash Paid') },
    { value: 'payment_received', label: t('Cash Received') },
    { value: 'credit_note', label: t('Credit Note') },
    { value: 'debit_note', label: t('Debit Note') },
    { value: 'adjustment', label: t('Adjustment') },
    { value: 'opening_balance', label: t('Opening Balance') },
    { value: 'discount_allowed', label: t('Discount Allowed') },
  ];

  const supplierTransactionTypes = [
    { value: 'purchase', label: t('Cash Received') },
    { value: 'payment_made', label: t('Cash Paid') },
    { value: 'purchase_return', label: t('Purchase Return') },
    { value: 'debit_note', label: t('Debit Note') },
    { value: 'credit_note', label: t('Credit Note') },
    { value: 'adjustment', label: t('Adjustment') },
    { value: 'opening_balance', label: t('Opening Balance') },
    { value: 'discount_received', label: t('Discount Received') },
  ];

  // Paying a supplier (Cash Paid) is money-out — show wallet balances there.
  // Receiving from a customer / recording a purchase is money-in — hide balances.
  const showWalletBalance = ledgerType === 'supplier' && formData.transactionType === 'payment_made';

  // No generic 'Bank Transfer'/'Cheque'/'Card'/'Credit' placeholders — those were static
  // text with no real ledger behind them. Every real account (Cash in Hand or a named
  // Bank Account / mobile wallet) is selectable by its own name, same convention as
  // Invoice/Purchase/Fast Billing's payment method pickers (see wallet-payment-options.ts).
  // A customer "Cash Paid" / debit note / adjustment on Cash takes that amount out of Cash in
  // Hand. Goods or services handed over on credit (a package, a panel, a USB) move no cash,
  // but with Cash as the only choice they were silently deducted from the drawer — so offer
  // an explicit no-cash method (server: isCreditLedgerPayment → no Cash Book line).
  const allowsCreditMethod =
    (ledgerType === 'customer' && ['sale', 'debit_note', 'adjustment'].includes(formData.transactionType)) ||
    formData.paymentMethod === 'Credit';
  const mergedPaymentMethods = buildMergedPaymentOptions(
    [
      { value: 'Cash', label: t('Cash') },
      ...(allowsCreditMethod ? [{ value: 'Credit', label: t('Credit (no cash)') }] : []),
    ],
    wallets,
    showWalletBalance,
    currencyMeta,
  );

  // The discount type only shows to people who may give one (or when editing one).
  const transactionTypes = (ledgerType === 'customer' ? customerTransactionTypes : supplierTransactionTypes).filter(
    (type) =>
      !isDiscountType(type.value) ||
      Boolean(entryId) ||
      (discountRules.available && discountRules.settings.allowStandalone),
  );

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
    const keepsCreditMethod = ledgerType === 'customer' && ['sale', 'debit_note', 'adjustment'].includes(value);
    setDiscountDraft(emptyDiscountDraft(discountRules.settings.defaultReason));
    setErrors({});
    setFormData({
      ...formData,
      transactionType: value,
      debit: newFieldState.enableDebit ? formData.debit : '',
      credit: newFieldState.enableCredit ? formData.credit : '',
      paymentMethod: formData.paymentMethod === 'Credit' && !keepsCreditMethod ? 'Cash' : formData.paymentMethod,
    });
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.transactionType) newErrors.transactionType = t('Transaction type is required');

    // A discount on its own: amount comes from the discount box, description can be automatic.
    if (isStandaloneDiscount && !entryId) {
      if (resolvedDiscount.error || resolvedDiscount.amount <= 0) {
        newErrors.discount = resolvedDiscount.error || t('Enter the discount amount');
      }
      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    }
    if (!formData.description) newErrors.description = t('Description is required');
    if (showSettlementDiscount && discountDraft.enabled && resolvedDiscount.error) {
      newErrors.discount = resolvedDiscount.error;
    }
    
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

    if (formData.paymentMethod === 'Wallet' && !formData.walletType) {
      newErrors.walletType = t('Please select wallet');
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
        
        const resolvedPaymentMethod = formData.paymentMethod === 'Wallet'
          ? `Wallet (${formData.walletType})`
          : formData.paymentMethod;

        const updatePayload = {
          transactionDate: date.toISOString(),
          description: formData.description,
          reference: formData.reference || undefined,
          paymentMethod: isDiscountType(editingEntry?.transactionType) ? undefined : resolvedPaymentMethod || undefined,
          notes: formData.notes || undefined,
          ...(isDiscountType(editingEntry?.transactionType) && editDiscountReason && editDiscountReason !== editingEntry?.discount?.reason
            ? { discountReason: editDiscountReason }
            : {}),
        };

        const url = ledgerType === 'customer'
          ? `${summery.updateCustomerLedgerEntry.url}/${entryId}`
          : `${summery.updateSupplierLedgerEntry.url}/${entryId}`;

        console.log('Update URL:', url);
        console.log('Update payload:', updatePayload);

        await Axios.patch(url, updatePayload);
        dispatch(mobileShopApi.util.invalidateTags(['Wallets', 'MobileDashboard', 'CashBook']));
        toast.success(t('Ledger entry updated successfully'));
        
        if (onSuccess) onSuccess();
      } else {
        // Create new entry - send full payload
        const resolvedPaymentMethod = formData.paymentMethod === 'Wallet'
          ? `Wallet (${formData.walletType})`
          : formData.paymentMethod;

        const discountDetails = {
          reason: discountDraft.reason,
          ...(resolvedDiscount.percent ? { percent: resolvedDiscount.percent, baseAmount: resolvedDiscount.baseAmount } : {}),
          ...(resolvedDiscount.overLimit && discountDraft.approvalNote.trim() ? { approvalNote: discountDraft.approvalNote.trim() } : {}),
        };
        const createPayload = isStandaloneDiscount
          ? {
              [ledgerType]: entityId,
              transactionType: discountType,
              transactionDate: date.toISOString(),
              description:
                formData.description.trim() ||
                `${ledgerType === 'customer' ? t('Discount allowed') : t('Discount received')} — ${discountReasonLabel(discountDraft.reason, t)}`,
              reference: formData.reference || undefined,
              debit: ledgerType === 'supplier' ? resolvedDiscount.amount : 0,
              credit: ledgerType === 'customer' ? resolvedDiscount.amount : 0,
              notes: discountDraft.note.trim() || formData.notes || undefined,
              discount: discountDetails,
            }
          : {
              [ledgerType]: entityId,
              transactionType: formData.transactionType,
              transactionDate: date.toISOString(),
              description: formData.description,
              reference: formData.reference || undefined,
              debit: parseFloat(formData.debit) || 0,
              credit: parseFloat(formData.credit) || 0,
              paymentMethod: resolvedPaymentMethod || undefined,
              notes: formData.notes || undefined,
              ...(showSettlementDiscount && discountDraft.enabled && resolvedDiscount.amount > 0
                ? {
                    settlementDiscount: {
                      amount: resolvedDiscount.amount,
                      ...discountDetails,
                      ...(discountDraft.note.trim() ? { note: discountDraft.note.trim() } : {}),
                    },
                  }
                : {}),
            };

        const url = ledgerType === 'customer'
          ? summery.addCustomerLedgerEntry.url
          : summery.addSupplierLedgerEntry.url;

        const response = await Axios.post(url, createPayload);
        dispatch(mobileShopApi.util.invalidateTags(['Wallets', 'MobileDashboard', 'CashBook']));

        // A supplier "Cash Paid" row is allocated to that supplier's open purchase invoices,
        // and a customer "Cash Received" row to that customer's open sale invoices (see
        // supplierPayment.service.js / customerPayment.service.js's identical
        // recordAllocationForLedgerEntry), so the purchase/invoice list's paid/remaining
        // columns are now stale — and the user should be told which bills their money just
        // cleared, not left to go and check.
        const allocation = response.data?.invoiceAllocation;
        const discountEntry = response.data?.discountEntry || (isStandaloneDiscount ? response.data : null);
        if (discountEntry || isStandaloneDiscount) {
          dispatch(ledgerDiscountsApi.util.invalidateTags(['DiscountRegister']));
          // A discount settles invoices too, even without a payment.
          if (ledgerType === 'customer') {
            dispatch(invoiceApi.util.invalidateTags(['Invoice']));
            dispatch(customerPaymentApi.util.invalidateTags(['CustomerPayment', 'CustomerAccount']));
          } else {
            dispatch(purchaseApi.util.invalidateTags(['Purchase']));
            dispatch(supplierPaymentApi.util.invalidateTags(['SupplierPayment', 'SupplierAccount']));
          }
        }
        const discountNote = discountEntry
          ? `${ledgerType === 'customer' ? t('Discount allowed') : t('Discount received')}: ${formatMoneyWithMeta(
              Number(discountEntry.credit || discountEntry.debit) || 0,
              currencyMeta,
            )}`
          : '';
        if (allocation) {
          if (ledgerType === 'customer') {
            dispatch(invoiceApi.util.invalidateTags(['Invoice']));
            dispatch(customerPaymentApi.util.invalidateTags(['CustomerPayment', 'CustomerAccount']));
          } else {
            dispatch(purchaseApi.util.invalidateTags(['Purchase']));
            dispatch(supplierPaymentApi.util.invalidateTags(['SupplierPayment', 'SupplierAccount']));
          }
        }

        if (allocation?.invoices?.length) {
          const settled = allocation.invoices.filter((invoice: any) => invoice.fullySettled).length;
          const partial = allocation.invoices.length - settled;
          toast.success(t('Payment recorded'), {
            description: [
              `${formatMoneyWithMeta(allocation.allocatedTotal, currencyMeta)} ${t('applied to')} ${allocation.invoices
                .map((invoice: any) => `#${invoice.invoiceNumber}`)
                .join(', ')}`,
              settled > 0 ? `${settled} ${t('invoice(s) fully paid')}` : '',
              partial > 0 ? `${partial} ${t('partially paid')}` : '',
              allocation.unappliedAmount > 0
                ? `${formatMoneyWithMeta(allocation.unappliedAmount, currencyMeta)} ${t('kept as advance')}`
                : '',
              discountNote,
            ]
              .filter(Boolean)
              .join(' · '),
          });
        } else if (allocation) {
          toast.success(t('Payment recorded'), {
            description: [`${t('No open invoices — kept as an advance against')} ${entityName}`, discountNote].filter(Boolean).join(' · '),
          });
        } else if (isStandaloneDiscount) {
          toast.success(ledgerType === 'customer' ? t('Discount allowed recorded') : t('Discount received recorded'), {
            description: formatMoneyWithMeta(resolvedDiscount.amount, currencyMeta),
          });
        } else {
          toast.success(t('Ledger entry added successfully'));
        }
        
        // Pass the created entry back if it's a payment received/made
        if (onSuccess) {
          if ((formData.transactionType === 'payment_received' || formData.transactionType === 'payment_made') && response.data) {
            onSuccess(response.data);
          } else {
            onSuccess();
          }
        }
      }
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
                <SelectTrigger className={entryId ? 'bg-gray-100 cursor-not-allowed w-full' : 'w-full'}>
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
                    className="w-full justify-start text-left font-normal overflow-hidden"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formatAppDate(date)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('Description')}{isStandaloneDiscount && !entryId ? '' : ' *'}</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={isStandaloneDiscount && !entryId ? t('Optional — written automatically from the reason') : t('Enter description')}
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

            {isStandaloneDiscount || isDiscountType(editingEntry?.transactionType) ? (
            <div className="space-y-2">
              <Label>{t('Reason')}</Label>
              {entryId ? (
                <Select value={editDiscountReason || 'other'} onValueChange={setEditDiscountReason}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DISCOUNT_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{t(r.label)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="flex min-h-9 items-center rounded-md border bg-muted/40 px-3 py-1 text-sm text-muted-foreground">
                  {t('No cash moves')}
                </p>
              )}
            </div>
            ) : (
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">{t('Payment Method')}</Label>
              <Select
                value={
                  formData.paymentMethod === 'Wallet' && formData.walletType
                    ? toWalletOptionValue(formData.walletType)
                    : formData.paymentMethod
                }
                onValueChange={(value) => {
                  if (isWalletOptionValue(value)) {
                    setFormData({ ...formData, paymentMethod: 'Wallet', walletType: getWalletTypeFromOptionValue(value) });
                  } else {
                    setFormData({ ...formData, paymentMethod: value, walletType: '' });
                  }
                }}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder={t('Select method')} />
                </SelectTrigger>
                <SelectContent>
                  {mergedPaymentMethods.map((method) => (
                    <SelectItem key={method.value} value={method.value}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.walletType && <p className="text-sm text-red-600">{errors.walletType}</p>}
              {ledgerType === 'customer' && formData.transactionType === 'sale' && formData.paymentMethod === 'Cash' && (
                <p className="text-xs text-muted-foreground">
                  {t('Cash Paid takes this amount out of Cash in Hand. For goods or services given on credit (udhaar), choose "Credit (no cash)".')}
                </p>
              )}
            </div>
            )}
          </div>

          {isStandaloneDiscount && !entryId ? (
            <div className="space-y-1">
              <SettlementDiscountFields
                side={ledgerType}
                draft={discountDraft}
                onChange={setDiscountDraft}
                paymentAmount={0}
                outstanding={outstanding}
                settings={discountRules.settings}
                canApprove={discountRules.canApprove}
                standalone
              />
              {errors.discount && <p className="text-sm text-red-600">{errors.discount}</p>}
            </div>
          ) : (

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

          )}

          {showSettlementDiscount && (
            <div className="space-y-1">
              <SettlementDiscountFields
                side={ledgerType}
                draft={discountDraft}
                onChange={setDiscountDraft}
                paymentAmount={paymentAmountForDiscount}
                outstanding={outstanding}
                settings={discountRules.settings}
                canApprove={discountRules.canApprove}
              />
              {errors.discount && discountDraft.enabled && <p className="text-sm text-red-600">{errors.discount}</p>}
            </div>
          )}

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
