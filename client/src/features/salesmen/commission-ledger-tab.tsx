import { useMemo, useState } from 'react';
import { useGetCommissionLedgerEntriesQuery, useGetCommissionBalanceQuery, CommissionLedgerEntry } from '@/stores/salesmanCommissionLedger.api';
import { useGetAllSalesmanProfilesQuery } from '@/stores/salesmanProfile.api';
import { useDeleteCommissionPaymentMutation } from '@/stores/salesmanCommissionPayment.api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wallet, Banknote, Trash2 } from 'lucide-react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { CommissionPaymentDialog } from './commission-payment-dialog';
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

function salesmanName(ref: CommissionLedgerEntry['salesmanId']): string {
  return typeof ref === 'string' ? ref : ref.name;
}

const TRANSACTION_TYPE_STYLES: Record<string, string> = {
  commission_earned: 'bg-green-100 text-green-800',
  commission_reversed: 'bg-red-100 text-red-800',
  commission_payment: 'bg-blue-100 text-blue-800',
  adjustment: 'bg-gray-100 text-gray-800',
};

export function CommissionLedgerTab() {
  const { t } = useLanguage();
  const [selectedSalesmanId, setSelectedSalesmanId] = useState('');
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [entryToVoid, setEntryToVoid] = useState<CommissionLedgerEntry | null>(null);

  const { data: salesmen } = useGetAllSalesmanProfilesQuery();
  const { data, isLoading, refetch } = useGetCommissionLedgerEntriesQuery({
    page: 1,
    limit: 100,
    salesmanId: selectedSalesmanId || undefined,
  });
  const { data: balanceData, refetch: refetchBalance } = useGetCommissionBalanceQuery(
    { salesmanId: selectedSalesmanId },
    { skip: !selectedSalesmanId }
  );
  const [deletePayment, { isLoading: isVoiding }] = useDeleteCommissionPaymentMutation();

  const entries = data?.results || [];
  const selectedSalesmanLabel = salesmen?.find((s) => s.id === selectedSalesmanId);
  const selectedSalesmanName = selectedSalesmanLabel?.name || '';

  const refetchAll = () => {
    refetch();
    refetchBalance();
  };

  const salesmanOptions = useMemo(
    () => (salesmen || []).map((s) => ({ value: s.id, label: s.name, sublabel: s.salesmanCode })),
    [salesmen]
  );

  const transactionTypeLabel: Record<string, string> = {
    commission_earned: t('commission_earned') || 'Earned',
    commission_reversed: t('commission_reversed') || 'Reversed',
    commission_payment: t('commission_payment') || 'Paid',
    adjustment: t('adjustment') || 'Adjustment',
  };

  const handleVoidConfirm = async () => {
    if (!entryToVoid?.referenceId) return;
    try {
      await deletePayment(entryToVoid.referenceId).unwrap();
      toast.success(t('commission_payment_voided') || 'Commission payment voided');
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
          <CardTitle>{t('commission_ledger') || 'Commission Ledger'}</CardTitle>
          <CardDescription>
            {t('commission_ledger_description') ||
              'Every commission credited or reversed, with a running balance per salesman'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-64">
              <SearchableSelect
                options={salesmanOptions}
                value={selectedSalesmanId}
                onValueChange={setSelectedSalesmanId}
                placeholder={t('select_salesman') || 'Select a salesman...'}
                clearLabel={t('all_salesmen') || 'All Salesmen'}
              />
            </div>
            {selectedSalesmanId && balanceData && (
              <div className="flex items-center gap-2 rounded-lg border px-4 py-2">
                <Wallet className="w-4 h-4 text-primary" />
                <span className="text-sm text-muted-foreground">{t('current_balance') || 'Current Balance'}:</span>
                <span className="font-semibold text-lg">Rs {balanceData.balance.toFixed(2)}</span>
              </div>
            )}
            {selectedSalesmanId && balanceData && balanceData.balance > 0 && (
              <Can permission="manageCommissionPayments">
                <Button onClick={() => setPaymentDialogOpen(true)}>
                  <Banknote className="w-4 h-4 mr-2" />
                  {t('pay_commission') || 'Pay Commission'}
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
                    {!selectedSalesmanId && <TableHead>{t('salesman') || 'Salesman'}</TableHead>}
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
                      {!selectedSalesmanId && <TableCell>{salesmanName(entry.salesmanId)}</TableCell>}
                      <TableCell>
                        <Badge className={TRANSACTION_TYPE_STYLES[entry.transactionType]}>
                          {transactionTypeLabel[entry.transactionType]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{entry.reference || '—'}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {entry.rate !== undefined ? `${entry.rate}%` : '—'}
                      </TableCell>
                      <TableCell className="text-right text-green-700">
                        {entry.credit > 0 ? `Rs ${entry.credit.toFixed(2)}` : '—'}
                      </TableCell>
                      <TableCell className="text-right text-red-700">
                        {entry.debit > 0 ? `Rs ${entry.debit.toFixed(2)}` : '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium">Rs {entry.balance.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        {entry.transactionType === 'commission_payment' && (
                          <Can permission="manageCommissionPayments">
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
                      <TableCell colSpan={selectedSalesmanId ? 8 : 9} className="text-center py-8 text-muted-foreground">
                        {t('no_commission_entries_found') ||
                          'No commission entries yet — they appear once a salesman-attributed invoice is finalized.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedSalesmanId && balanceData && (
        <CommissionPaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          salesmanId={selectedSalesmanId}
          salesmanName={selectedSalesmanName}
          balance={balanceData.balance}
          onSuccess={refetchAll}
        />
      )}

      <AlertDialog open={!!entryToVoid} onOpenChange={(open) => !open && setEntryToVoid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('void_payment') || 'Void Payment'}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('void_payment_confirmation') ||
                `Are you sure you want to void this Rs ${entryToVoid?.debit.toFixed(2)} commission payment? The amount will be added back to the salesman's balance.`}
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
