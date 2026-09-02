import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useGetCommissionLedgerEntriesQuery, useGetCommissionBalanceQuery, CommissionLedgerEntry } from '@/stores/salesmanCommissionLedger.api';
import { useGetAllSalesmanProfilesQuery } from '@/stores/salesmanProfile.api';
import { useDeleteCommissionPaymentMutation } from '@/stores/salesmanCommissionPayment.api';
import { useGetSalesmanCommissionReportQuery } from '@/stores/reports.api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Wallet, Banknote, Trash2, Users, TrendingUp, HandCoins, AlertCircle, Filter, Download } from 'lucide-react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { InvoiceDetailDialog } from '@/components/invoice-detail-dialog';
import { CommissionPaymentDialog } from './commission-payment-dialog';
import { useLanguage } from '@/context/language-context';
import { Can } from '@/context/permission-context';
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones';
import { cn } from '@/lib/utils';
import { useFormatMoney } from '@/lib/format-money';
import { format, startOfMonth } from 'date-fns';
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

const ALL_TRANSACTION_TYPES = ['commission_earned', 'commission_reversed', 'commission_payment', 'adjustment'];

export function CommissionLedgerTab() {
  const { t } = useLanguage();
  const formatRs = useFormatMoney();
  const [selectedSalesmanId, setSelectedSalesmanId] = useState('');
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [entryToVoid, setEntryToVoid] = useState<CommissionLedgerEntry | null>(null);
  const [viewingInvoiceId, setViewingInvoiceId] = useState<string | undefined>(undefined);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());

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

  // This-month totals + all-time outstanding balance for the KPI row — one call covers
  // all four cards since `totalOutstanding` is a current snapshot, not period-scoped.
  const monthRange = useMemo(() => {
    const now = new Date();
    return { startDate: format(startOfMonth(now), 'yyyy-MM-dd'), endDate: format(now, 'yyyy-MM-dd') };
  }, []);
  const { data: commissionSummary } = useGetSalesmanCommissionReportQuery(monthRange);

  const entries = useMemo(() => data?.results || [], [data?.results]);
  const filteredEntries = useMemo(
    () => entries.filter((entry) => !hiddenTypes.has(entry.transactionType)),
    [entries, hiddenTypes]
  );
  const selectedSalesmanLabel = salesmen?.find((s) => s.id === selectedSalesmanId);
  const selectedSalesmanName = selectedSalesmanLabel?.name || '';

  const totalSalesmenCount = salesmen?.length ?? 0;
  const activeSalesmenCount = salesmen?.filter((s) => s.status !== 'inactive').length ?? 0;

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

  const toggleTypeVisible = (type: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const handleExport = () => {
    const rows = filteredEntries.map((entry) => ({
      Date: format(new Date(entry.transactionDate), 'yyyy-MM-dd'),
      ...(selectedSalesmanId ? {} : { Salesman: salesmanName(entry.salesmanId) }),
      Type: transactionTypeLabel[entry.transactionType] || entry.transactionType,
      Reference: entry.reference || '',
      'Rate (%)': entry.rate ?? '',
      Credit: entry.credit || 0,
      Debit: entry.debit || 0,
      Balance: entry.balance,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Commission Ledger');
    const label = selectedSalesmanName ? selectedSalesmanName.replace(/\s+/g, '-') : 'all-salesmen';
    XLSX.writeFile(wb, `commission-ledger-${label}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className={kpiCardClass('sky')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('total_salesmen') || 'Total Salesmen'}</CardTitle>
            <div className={cn('shrink-0', toneIconWrapClass('sky'))}>
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSalesmenCount}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeSalesmenCount} {t('active') || 'active'}
            </p>
          </CardContent>
        </Card>

        <Card className={kpiCardClass('emerald')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('total_earned_this_month') || 'Total Earned (This Month)'}
            </CardTitle>
            <div className={cn('shrink-0', toneIconWrapClass('emerald'))}>
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatRs(commissionSummary?.summary.totalEarned ?? 0)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('from_n_transactions', { count: commissionSummary?.summary.totalSalesCount ?? 0 }) ||
                `From ${commissionSummary?.summary.totalSalesCount ?? 0} transactions`}
            </p>
          </CardContent>
        </Card>

        <Card className={kpiCardClass('orange')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('total_paid_this_month') || 'Total Paid (This Month)'}
            </CardTitle>
            <div className={cn('shrink-0', toneIconWrapClass('orange'))}>
              <HandCoins className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {formatRs(commissionSummary?.summary.totalPaid ?? 0)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('from_n_transactions', { count: commissionSummary?.summary.totalPaidCount ?? 0 }) ||
                `From ${commissionSummary?.summary.totalPaidCount ?? 0} transactions`}
            </p>
          </CardContent>
        </Card>

        <Card className={kpiCardClass('rose')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('outstanding_balance') || 'Outstanding Balance'}</CardTitle>
            <div className={cn('shrink-0', toneIconWrapClass('rose'))}>
              <AlertCircle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
              {formatRs(commissionSummary?.summary.totalOutstanding ?? 0)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t('unpaid_commissions') || 'Unpaid commissions'}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>{t('commission_ledger') || 'Commission Ledger'}</CardTitle>
            <CardDescription>
              {t('commission_ledger_description') ||
                'Every commission credited or reversed, with a running balance per salesman'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="mr-2 h-4 w-4" />
                  {t('filter') || 'Filter'}
                  {hiddenTypes.size > 0 && (
                    <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                      {ALL_TRANSACTION_TYPES.length - hiddenTypes.size}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>{t('transaction_type') || 'Transaction Type'}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {ALL_TRANSACTION_TYPES.map((type) => (
                  <DropdownMenuCheckboxItem
                    key={type}
                    checked={!hiddenTypes.has(type)}
                    onCheckedChange={() => toggleTypeVisible(type)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {transactionTypeLabel[type]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredEntries.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              {t('export') || 'Export'}
            </Button>
          </div>
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
                <span className="font-semibold text-lg">{formatRs(balanceData.balance)}</span>
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
                  {filteredEntries.map((entry) => (
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
                      <TableCell className="text-sm text-muted-foreground">
                        {entry.referenceId && entry.referenceModel === 'Invoice' ? (
                          <Button
                            variant="link"
                            className="h-auto p-0 font-normal text-blue-600 hover:text-blue-800"
                            onClick={() => {
                              setViewingInvoiceId(String(entry.referenceId));
                              setInvoiceDialogOpen(true);
                            }}
                          >
                            {entry.reference || entry.referenceId}
                          </Button>
                        ) : (
                          entry.reference || '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {entry.rate !== undefined ? `${entry.rate}%` : '—'}
                      </TableCell>
                      <TableCell className="text-right text-green-700">
                        {entry.credit > 0 ? formatRs(entry.credit) : '—'}
                      </TableCell>
                      <TableCell className="text-right text-red-700">
                        {entry.debit > 0 ? formatRs(entry.debit) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatRs(entry.balance)}</TableCell>
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
                  {filteredEntries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={selectedSalesmanId ? 8 : 9} className="text-center py-8 text-muted-foreground">
                        {entries.length > 0
                          ? t('no_commission_entries_match_filter') || 'No entries match the selected filter.'
                          : t('no_commission_entries_found') ||
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

      <InvoiceDetailDialog invoiceId={viewingInvoiceId} open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen} />

      <AlertDialog open={!!entryToVoid} onOpenChange={(open) => !open && setEntryToVoid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('void_payment') || 'Void Payment'}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('void_payment_confirmation') ||
                `Are you sure you want to void this ${formatRs(entryToVoid?.debit ?? 0)} commission payment? The amount will be added back to the salesman's balance.`}
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
