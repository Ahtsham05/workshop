import { useEffect } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreatePartnerPaymentMutation } from '@/stores/partnerPayment.api';
import { useGetWalletsQuery } from '@/stores/mobile-shop.api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/context/language-context';
import toast from 'react-hot-toast';

const paymentSchema = z
  .object({
    amount: z.coerce.number().positive(),
    paymentMethod: z.enum(['cash', 'bank', 'wallet']),
    walletType: z.string(),
    reference: z.string(),
    notes: z.string(),
  })
  .refine((data) => data.paymentMethod !== 'wallet' || !!data.walletType, {
    message: 'Select a wallet',
    path: ['walletType'],
  });

type PaymentFormValues = z.infer<typeof paymentSchema>;

interface PartnerPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partnerId: string;
  partnerName: string;
  balance: number;
  onSuccess: () => void;
}

export function PartnerPaymentDialog({
  open,
  onOpenChange,
  partnerId,
  partnerName,
  balance,
  onSuccess,
}: PartnerPaymentDialogProps) {
  const { t } = useLanguage();
  const { data: walletsData } = useGetWalletsQuery(undefined, { skip: !open });
  const wallets = walletsData?.results?.filter((w) => w.isActive) ?? [];
  const [createPayment, { isLoading }] = useCreatePartnerPaymentMutation();

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: balance,
      paymentMethod: 'cash',
      walletType: '',
      reference: '',
      notes: '',
    },
    mode: 'onChange',
  });

  useEffect(() => {
    if (open) {
      form.reset({
        amount: balance,
        paymentMethod: 'cash',
        walletType: '',
        reference: '',
        notes: '',
      });
    }
  }, [open, balance, form]);

  const paymentMethod = form.watch('paymentMethod');

  const onSubmit: SubmitHandler<PaymentFormValues> = async (data) => {
    if (data.amount > balance) {
      form.setError('amount', { message: `Cannot exceed the outstanding balance of Rs ${balance.toFixed(2)}` });
      return;
    }
    try {
      await createPayment({
        partnerId,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        walletType: data.paymentMethod === 'wallet' ? data.walletType : undefined,
        reference: data.reference,
        notes: data.notes,
      }).unwrap();
      toast.success(t('partner_payment_recorded') || 'Partner payment recorded');
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.data?.message || t('operation_failed') || 'Operation failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{t('pay_partner') || 'Pay Partner'}</DialogTitle>
          <DialogDescription>
            {partnerName} — {t('outstanding_balance') || 'Outstanding balance'}: Rs {balance.toFixed(2)}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('amount') || 'Amount'} *</FormLabel>
                  <FormControl>
                    <Input type="number" min={0.01} max={balance} step="0.01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('payment_method') || 'Payment Method'}</FormLabel>
                  <Select value={field.value} onValueChange={(v) => field.onChange(v as 'cash' | 'bank' | 'wallet')}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="cash">{t('cash') || 'Cash'}</SelectItem>
                      <SelectItem value="bank">{t('bank_transfer') || 'Bank Transfer'}</SelectItem>
                      <SelectItem value="wallet">{t('wallet') || 'Wallet'}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {paymentMethod === 'wallet' && (
              <FormField
                control={form.control}
                name="walletType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('wallet') || 'Wallet'} *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t('select_wallet') || 'Select a wallet...'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {wallets.map((w) => (
                          <SelectItem key={w.id} value={w.type}>
                            {w.type} (Rs {w.balance.toFixed(2)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="reference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('reference') || 'Reference'}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('optional') || 'Optional'} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('notes') || 'Notes'}</FormLabel>
                  <FormControl>
                    <Textarea className="resize-none" rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('cancel') || 'Cancel'}
              </Button>
              <Button type="submit" disabled={isLoading || balance <= 0}>
                {isLoading ? t('saving') || 'Saving...' : t('pay_partner') || 'Pay Partner'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
