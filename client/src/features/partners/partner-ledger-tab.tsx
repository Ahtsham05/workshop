import { useMemo, useState } from 'react';
import {
  useGetPartnerProfitShareLedgerEntriesQuery,
  useGetPartnerProfitShareBalanceQuery,
  PartnerProfitShareLedgerEntry,
} from '@/stores/partnerProfitShareLedger.api';
import { useGetAllPartnersQuery } from '@/stores/partner.api';
import { useDeletePartnerPaymentMutation } from '@/stores/partnerPayment.api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wallet, Banknote, Trash2 } from 'lucide-react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { PartnerPaymentDialog } from './partner-payment-dialog';
import { useLanguage } from '@/context/language-context';
import { Can } from '@/context/permission-context';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function partnerLabel(ref: PartnerProfitShareLedgerEntry['partnerId']): string {
  return typeof ref === 'string' ? ref : ref.name;
}

// "from Batch LOT-2026-08" / "from Red / XL" — lets the ledger stay legible about exactly
// which lot/variant a credit came from, for entries earned off a batch- or variant-scoped
// rule (see partnerProfitShareEngine.service.js).
function entryContext(entry: PartnerProfitShareLedgerEntry): string | null {
  if (entry.batchId && typeof entry.batchId !== 'string') {
    return `Batch ${entry.batchId.batchNumber}`;
  }
  if (entry.variantId && typeof entry.variantId !== 'string') {
    const label = Object.values(entry.variantId.attributes || {}).join(' / ');
    return label ? `Variant ${label}` : null;
  }
  return null;
}

const TRANSACTION_TYPE_STYLES: Record<string, string> = {
  share_earned: 'bg-green-100 text-green-800',
  share_reversed: 'bg-red-100 text-red-800',
  share_payment: 'bg-blue-100 text-blue-800',
  adjustment: 'bg-gray-100 text-gray-800',
};

export function PartnerLedgerTab() {
  const { t } = useLanguage();
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [entryToVoid, setEntryToVoid] = useState<PartnerProfitShareLedgerEntry | null>(null);

  const { data: partners } = useGetAllPartnersQuery();
  const { data, isLoading, refetch } = useGetPartnerProfitShareLedgerEntriesQuery({
    page: 1,
    limit: 100,
    partnerId: selectedPartnerId || undefined,
  });
  const { data: balanceData, refetch: refetchBalance } = useGetPartnerProfitShareBalanceQuery(
    { partnerId: selectedPartnerId },
    { skip: !selectedPartnerId }
  );
  const [deletePayment, { isLoading: isVoiding }] = useDeletePartnerPaymentMutation();

  const entries = data?.results || [];
  const selectedPartner = (partners || []).find((p) => p.id === selectedPartnerId);

  const refetchAll = () => {
    refetch();
    refetchBalance();
  };

  const partnerOptions = useMemo(() => (partners || []).map((p) => ({ value: p.id, label: p.name })), [partners]);

  const transactionTypeLabel: Record<string, string> = {
    share_earned: t('share_earned') || 'Earned',
    share_reversed: t('share_reversed') || 'Reversed',
    share_payment: t('share_payment') || 'Paid',
    adjustment: t('adjustment') || 'Adjustment',
  };

  const handleVoidConfirm = async () => {
    if (!entryToVoid?.referenceId) return;
    try {
      await deletePayment(entryToVoid.referenceId).unwrap();
      toast.success(t('partner_payment_voided') || 'Partner payment voided');
      refetchAll();
    } catch (error: any) {
      toast.error(error?.data?.message || t('operation_failed') || 'Operation failed');
    } finally {
      setEntryToVoid(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('partner_ledger') || 'Partner Ledger'}</CardTitle>
          <CardDescription>
            {t('partner_ledger_description') || 'Every share credited or reversed, with a running balance per partner'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-64">
              <SearchableSelect
                options={partnerOptions}
                value={selectedPartnerId}
                onValueChange={setSelectedPartnerId}
                placeholder={t('select_partner') || 'Select a partner...'}
                clearLabel={t('all_partners') || 'All Partners'}
              />
            </div>
            {selectedPartnerId && balanceData && (
              <div className="flex items-center gap-2 rounded-lg border px-4 py-2">
                <Wallet className="w-4 h-4 text-primary" />
                <span className="text-sm text-muted-foreground">{t('current_balance') || 'Current Balance'}:</span>
                <span className="font-semibold text-lg">Rs {balanceData.balance.toFixed(2)}</span>
              </div>
            )}
            {selectedPartnerId && balanceData && balanceData.balance > 0 && (
              <Can permission="managePartnerPayments">
                <Button onClick={() => setPaymentDialogOpen(true)}>
                  <Banknote className="w-4 h-4 mr-2" />
                  {t('pay_partner') || 'Pay Partner'}
                </Button>
              </Can>
            )}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('date') || 'Date'}</TableHead>
                    {!selectedPartnerId && <TableHead>{t('partner') || 'Partner'}</TableHead>}
                    <TableHead>{t('type') || 'Type'}</TableHead>
                    <TableHead>{t('reference') || 'Reference'}</TableHead>
                    <TableHead className="text-right">{t('rate') || 'Rate'}</TableHead>
                    <TableHead className="text-right">{t('credit') || 'Credit'}</TableHead>
                    <TableHead className="text-right">{t('debit') || 'Debit'}</TableHead>
                    <TableHead className="text-right">{t('balance') || 'Balance'}</TableHead>
                    <TableHead className="text-right">{t('actions') || 'Actions'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(entry.transactionDate), 'MMM dd, yyyy')}
                      </TableCell>
                      {!selectedPartnerId && <TableCell>{partnerLabel(entry.partnerId)}</TableCell>}
                      <TableCell>
                        <Badge className={TRANSACTION_TYPE_STYLES[entry.transactionType]}>
                          {transactionTypeLabel[entry.transactionType]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {entry.reference || '—'}
                        {entryContext(entry) && <div className="text-xs">{entryContext(entry)}</div>}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {entry.rate !== undefined
                          ? entry.shareType === 'fixed_per_unit'
                            ? `Rs ${entry.rate}/unit`
                            : `${entry.rate}%`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right text-green-700">
                        {entry.credit > 0 ? `Rs ${entry.credit.toFixed(2)}` : '—'}
                      </TableCell>
                      <TableCell className="text-right text-red-700">
                        {entry.debit > 0 ? `Rs ${entry.debit.toFixed(2)}` : '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium">Rs {entry.balance.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        {entry.transactionType === 'share_payment' && (
                          <Can permission="managePartnerPayments">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEntryToVoid(entry)}
                              title={t('void_payment') || 'Void payment'}
                              disabled={isVoiding}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </Can>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {entries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={selectedPartnerId ? 8 : 9} className="text-center py-8 text-muted-foreground">
                        {t('no_ledger_entries_found') ||
                          'No entries yet — they appear once a partner-linked sale is finalized.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedPartnerId && balanceData && (
        <PartnerPaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          partnerId={selectedPartnerId}
          partnerName={selectedPartner?.name || ''}
          balance={balanceData.balance}
          onSuccess={refetchAll}
        />
      )}

      <AlertDialog open={!!entryToVoid} onOpenChange={(open) => !open && setEntryToVoid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('void_payment') || 'Void Payment'}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('void_partner_payment_confirmation') ||
                `Are you sure you want to void this Rs ${entryToVoid?.debit.toFixed(2)} payment? The amount will be added back to the partner's balance.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel') || 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction onClick={handleVoidConfirm} className="bg-destructive text-destructive-foreground">
              {t('void_payment') || 'Void Payment'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
