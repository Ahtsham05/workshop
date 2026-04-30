import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  Edit,
  Trash2,
  Download,
  TrendingUp,
  TrendingDown,
  Wallet,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import Axios from '@/utils/Axios';
import summery from '@/utils/summery';
import { toast } from 'sonner';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { useLanguage } from '@/context/language-context';

interface LedgerEntry {
  _id?: string;
  id?: string;
  transactionType: string;
  transactionDate: string;
  description: string;
  category?: string;
  reference?: string;
  debit: number;
  credit: number;
  balance: number;
  paymentMethod?: string;
  notes?: string;
}

interface EntryFormData {
  transactionType: string;
  transactionDate: string;
  description: string;
  category: string;
  reference: string;
  amount: string;
  paymentMethod: string;
  notes: string;
}

const TRANSACTION_TYPES = [
  { value: 'income', label: 'Income (Money In)', icon: ArrowDownLeft, color: 'text-green-600' },
  { value: 'expense', label: 'Expense (Money Out)', icon: ArrowUpRight, color: 'text-red-600' },
  { value: 'transfer', label: 'Transfer', icon: TrendingUp, color: 'text-blue-600' },
  { value: 'opening_balance', label: 'Opening Balance', icon: Wallet, color: 'text-purple-600' },
  { value: 'adjustment', label: 'Adjustment', icon: TrendingDown, color: 'text-orange-600' },
];

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Card', 'Cheque', 'Other'];

const CATEGORIES = {
  income: ['Salary', 'Business Income', 'Freelance', 'Rent Income', 'Investment Return', 'Gift', 'Other'],
  expense: ['Rent', 'Utilities', 'Food', 'Transport', 'Shopping', 'Medical', 'Education', 'Entertainment', 'Other'],
  transfer: ['Bank to Cash', 'Cash to Bank', 'Account to Account', 'Other'],
  opening_balance: ['Opening Balance'],
  adjustment: ['Correction', 'Other'],
};

const formatCurrency = (value: number) =>
  `Rs ${Number(value || 0).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function EntryForm({
  editingEntry,
  onSuccess,
  onCancel,
}: {
  editingEntry: LedgerEntry | null;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<EntryFormData>({
    transactionType: editingEntry?.transactionType || 'income',
    transactionDate: editingEntry
      ? format(new Date(editingEntry.transactionDate), 'yyyy-MM-dd')
      : format(new Date(), 'yyyy-MM-dd'),
    description: editingEntry?.description || '',
    category: editingEntry?.category || '',
    reference: editingEntry?.reference || '',
    amount: editingEntry ? String(editingEntry.credit || editingEntry.debit || '') : '',
    paymentMethod: editingEntry?.paymentMethod || '',
    notes: editingEntry?.notes || '',
  });

  const isIncomeType = (type: string) => type === 'income' || type === 'opening_balance';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim()) {
      toast.error(t('Description is required'));
      return;
    }
    const amount = parseFloat(form.amount);
    if (!form.amount || isNaN(amount) || amount <= 0) {
      toast.error(t('Please enter a valid amount'));
      return;
    }

    const isCredit = isIncomeType(form.transactionType);
    const payload = {
      transactionType: form.transactionType,
      transactionDate: new Date(form.transactionDate).toISOString(),
      description: form.description.trim(),
      category: form.category || undefined,
      reference: form.reference || undefined,
      debit: isCredit ? 0 : amount,
      credit: isCredit ? amount : 0,
      paymentMethod: form.paymentMethod || undefined,
      notes: form.notes || undefined,
    };

    try {
      setLoading(true);
      if (editingEntry) {
        const entryId = editingEntry.id || editingEntry._id;
        await Axios.patch(`${summery.updatePersonalLedgerEntry.url}/${entryId}`, {
          transactionDate: payload.transactionDate,
          description: payload.description,
          category: payload.category,
          reference: payload.reference,
          paymentMethod: payload.paymentMethod,
          notes: payload.notes,
        });
        toast.success(t('Entry updated successfully'));
      } else {
        await Axios.post(summery.addPersonalLedgerEntry.url, payload);
        toast.success(t('Entry added successfully'));
      }
      onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('Failed to save entry'));
    } finally {
      setLoading(false);
    }
  };

  const categoryOptions = CATEGORIES[form.transactionType as keyof typeof CATEGORIES] || CATEGORIES.income;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>{t('Type')}</Label>
          <Select
            value={form.transactionType}
            onValueChange={(v) => setForm(f => ({ ...f, transactionType: v, category: '' }))}
            disabled={!!editingEntry}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRANSACTION_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>{t('Date')}</Label>
          <Input
            type="date"
            value={form.transactionDate}
            onChange={e => setForm(f => ({ ...f, transactionDate: e.target.value }))}
            required
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>{t('Description')}</Label>
        <Input
          placeholder={t('Enter description (e.g. Salary from employer, Paid rent)')}
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>{t('Amount')} (Rs)</Label>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={form.amount}
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
            disabled={!!editingEntry}
            required
          />
          {editingEntry && (
            <p className="text-xs text-muted-foreground">{t('Amount cannot be changed after creation')}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label>{t('Payment Method')}</Label>
          <Select
            value={form.paymentMethod}
            onValueChange={(v) => setForm(f => ({ ...f, paymentMethod: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('Select method')} />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map(m => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>{t('Category')}</Label>
          <Select
            value={form.category}
            onValueChange={(v) => setForm(f => ({ ...f, category: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('Select category')} />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>{t('Reference')}</Label>
          <Input
            placeholder={t('Optional reference number')}
            value={form.reference}
            onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>{t('Notes')}</Label>
        <Textarea
          placeholder={t('Optional notes')}
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>{t('Cancel')}</Button>
        <Button type="submit" disabled={loading}>
          {loading ? t('Saving...') : editingEntry ? t('Update Entry') : t('Add Entry')}
        </Button>
      </div>
    </form>
  );
}

export function PersonalLedger() {
  const { t } = useLanguage();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [reportEntries, setReportEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [summary, setSummary] = useState({ totalCredit: 0, totalDebit: 0, netBalance: 0, transactionCount: 0 });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [startDate, setStartDate] = useState(format(new Date(new Date().setDate(new Date().getDate() - 30)), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [openingBalanceValue, setOpeningBalanceValue] = useState(0);

  useEffect(() => {
    fetchEntries();
    fetchReportEntries();
  }, [currentPage, pageSize, filterType, startDate, endDate]);

  useEffect(() => {
    fetchOpeningBalance();
  }, [startDate]);

  useEffect(() => {
    fetchSummary();
  }, [reportEntries]);

  const getPreviousDateString = (dateStr: string) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() - 1);
    return format(d, 'yyyy-MM-dd');
  };

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const params: any = {
        sortBy: 'transactionDate:asc',
        page: currentPage,
        limit: pageSize,
      };
      if (filterType !== 'all') params.transactionType = filterType;
      if (search.trim()) params.search = search.trim();
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const response = await Axios.get(summery.fetchPersonalLedgerEntries.url, { params });
      setEntries(response.data.results || []);
      setTotalPages(response.data.totalPages || 1);
      setTotalResults(response.data.totalResults || 0);
    } catch {
      toast.error(t('Failed to load entries'));
    } finally {
      setLoading(false);
    }
  };

  const fetchReportEntries = async () => {
    try {
      setReportLoading(true);
      const params: any = {
        sortBy: 'transactionDate:asc',
        page: 1,
        limit: 5000,
      };
      if (filterType !== 'all') params.transactionType = filterType;
      if (search.trim()) params.search = search.trim();
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const response = await Axios.get(summery.fetchPersonalLedgerEntries.url, { params });
      setReportEntries(response.data.results || []);
    } catch {
      toast.error(t('Failed to load report data'));
    } finally {
      setReportLoading(false);
    }
  };

  const fetchOpeningBalance = async () => {
    if (!startDate) {
      setOpeningBalanceValue(0);
      return;
    }
    try {
      const previousDate = getPreviousDateString(startDate);
      const response = await Axios.get(summery.fetchPersonalLedgerEntries.url, {
        params: {
          sortBy: 'transactionDate:desc',
          page: 1,
          limit: 1,
          endDate: previousDate,
        },
      });
      const lastBeforePeriod = response.data?.results?.[0];
      setOpeningBalanceValue(Number(lastBeforePeriod?.balance || 0));
    } catch {
      setOpeningBalanceValue(0);
    }
  };

  const fetchSummary = async () => {
    if (!reportEntries.length) {
      setSummary({ totalCredit: 0, totalDebit: 0, netBalance: 0, transactionCount: 0 });
      return;
    }
    const totalCredit = reportEntries.reduce((sum, entry) => sum + (entry.credit || 0), 0);
    const totalDebit = reportEntries.reduce((sum, entry) => sum + (entry.debit || 0), 0);
    setSummary({
      totalCredit,
      totalDebit,
      netBalance: totalCredit - totalDebit,
      transactionCount: reportEntries.length,
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchEntries();
  };

  const handleDelete = async (entry: LedgerEntry) => {
    if (!confirm(t('Are you sure you want to delete this entry?'))) return;
    try {
      const id = entry.id || entry._id;
      await Axios.delete(`${summery.deletePersonalLedgerEntry.url}/${id}`);
      toast.success(t('Entry deleted successfully'));
      fetchEntries();
      fetchReportEntries();
      fetchOpeningBalance();
      fetchSummary();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('Failed to delete entry'));
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingEntry(null);
    setCurrentPage(1);
    fetchEntries();
    fetchReportEntries();
    fetchOpeningBalance();
    fetchSummary();
  };

  const reportAnalytics = useMemo(() => {
    if (!reportEntries.length) {
      return {
        openingBalance: openingBalanceValue,
        closingBalance: openingBalanceValue,
        netChange: 0,
        avgTxn: 0,
        largestIn: 0,
        largestOut: 0,
      };
    }
    const last = reportEntries[reportEntries.length - 1];
    const openingBalance = openingBalanceValue;
    const closingBalance = last.balance || 0;
    const largestIn = reportEntries.reduce((max, e) => Math.max(max, e.credit || 0), 0);
    const largestOut = reportEntries.reduce((max, e) => Math.max(max, e.debit || 0), 0);
    return {
      openingBalance,
      closingBalance,
      netChange: closingBalance - openingBalance,
      avgTxn: summary.transactionCount ? (summary.totalCredit + summary.totalDebit) / summary.transactionCount : 0,
      largestIn,
      largestOut,
    };
  }, [openingBalanceValue, reportEntries, summary.totalCredit, summary.totalDebit, summary.transactionCount]);

  const exportToExcel = () => {
    try {
      const detailData = reportEntries.map(entry => ({
        Date: format(new Date(entry.transactionDate), 'MMM dd, yyyy'),
        Type: getTypeLabel(entry.transactionType),
        Description: entry.description,
        Category: entry.category || '-',
        Reference: entry.reference || '-',
        'Money In (Credit)': entry.credit > 0 ? entry.credit.toFixed(2) : '-',
        'Money Out (Debit)': entry.debit > 0 ? entry.debit.toFixed(2) : '-',
        Balance: entry.balance.toFixed(2),
        'Payment Method': entry.paymentMethod || '-',
        Notes: entry.notes || '-',
      }));
      const wb = XLSX.utils.book_new();
      const summaryData = [
        { Metric: 'Period Start', Value: startDate || '-' },
        { Metric: 'Period End', Value: endDate || '-' },
        { Metric: 'Opening Balance', Value: reportAnalytics.openingBalance.toFixed(2) },
        { Metric: 'Total Money In', Value: summary.totalCredit.toFixed(2) },
        { Metric: 'Total Money Out', Value: summary.totalDebit.toFixed(2) },
        { Metric: 'Net Change', Value: reportAnalytics.netChange.toFixed(2) },
        { Metric: 'Closing Balance', Value: reportAnalytics.closingBalance.toFixed(2) },
        { Metric: 'Transactions', Value: summary.transactionCount },
        { Metric: 'Average Transaction', Value: reportAnalytics.avgTxn.toFixed(2) },
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Summary');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailData), 'Transaction Details');
      XLSX.writeFile(wb, `personal-ledger-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      toast.success(t('Exported successfully'));
    } catch {
      toast.error(t('Failed to export'));
    }
  };

  const getTypeLabel = (type: string) => {
    const found = TRANSACTION_TYPES.find(t => t.value === type);
    return found ? found.label : type;
  };

  const getTypeBadge = (type: string) => {
    const map: Record<string, string> = {
      income: 'bg-green-100 text-green-700 border-green-200',
      expense: 'bg-red-100 text-red-700 border-red-200',
      transfer: 'bg-blue-100 text-blue-700 border-blue-200',
      opening_balance: 'bg-purple-100 text-purple-700 border-purple-200',
      adjustment: 'bg-orange-100 text-orange-700 border-orange-200',
    };
    return map[type] || 'bg-gray-100 text-gray-700';
  };

  const balanceColor = summary.netBalance >= 0 ? 'text-green-600' : 'text-red-600';

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-5 pb-5 min-h-[110px]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('Total Money In')}</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(summary.totalCredit)}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                <ArrowDownLeft className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5 min-h-[110px]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('Total Money Out')}</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(summary.totalDebit)}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <ArrowUpRight className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5 min-h-[110px]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('Net Balance')}</p>
                <p className={`text-2xl font-bold ${balanceColor}`}>
                  {formatCurrency(summary.netBalance)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {summary.netBalance >= 0 ? t('Positive') : t('Negative')}
                </p>
              </div>
              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${summary.netBalance >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                <Wallet className={`h-5 w-5 ${balanceColor}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5 min-h-[110px]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Opening Balance</p>
                <p className="text-xl font-bold">{formatCurrency(reportAnalytics.openingBalance)}</p>
              </div>
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5 min-h-[110px]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Closing Balance</p>
                <p className="text-xl font-bold text-purple-600">{formatCurrency(reportAnalytics.closingBalance)}</p>
              </div>
              <Wallet className="h-5 w-5 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5 min-h-[110px]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Transaction</p>
                <p className="text-xl font-bold">{formatCurrency(reportAnalytics.avgTxn)}</p>
              </div>
              <Search className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('Search entries...')}
                className="pl-8 w-52"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Button type="submit" variant="outline" size="sm">{t('Search')}</Button>
          </form>

          <Input
            type="date"
            value={startDate}
            onChange={e => { setStartDate(e.target.value); setCurrentPage(1); }}
            className="w-[150px]"
          />
          <Input
            type="date"
            value={endDate}
            onChange={e => { setEndDate(e.target.value); setCurrentPage(1); }}
            className="w-[150px]"
          />

          <Select value={filterType} onValueChange={(v) => { setFilterType(v); setCurrentPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('All Types')}</SelectItem>
              {TRANSACTION_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Label className="text-sm whitespace-nowrap">{t('Show')}</Label>
            <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map(n => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 xl:justify-end">
          <Button variant="outline" size="sm" onClick={exportToExcel}>
            <Download className="w-4 h-4 mr-2" />
            {t('Export')}
          </Button>
          <Button onClick={() => { setEditingEntry(null); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            {t('Add Entry')}
          </Button>
        </div>
      </div>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => {
        if (!open) { setEditingEntry(null); }
        setShowForm(open);
      }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingEntry ? t('Edit Entry') : t('Add Transaction')}</DialogTitle>
          </DialogHeader>
          {showForm && (
            <EntryForm
              editingEntry={editingEntry}
              onSuccess={handleFormSuccess}
              onCancel={() => { setShowForm(false); setEditingEntry(null); }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Entries Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('Transaction History')} ({totalResults})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading || reportLoading ? (
            <div className="text-center py-12 text-muted-foreground">{t('Loading...')}</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground space-y-2">
              <Wallet className="h-10 w-10 mx-auto opacity-30" />
              <p>{t('No transactions yet')}</p>
              <p className="text-sm">{t('Click "Add Entry" to record your first transaction')}</p>
            </div>
          ) : (
            <div className="border-t overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Date')}</TableHead>
                    <TableHead>{t('Type')}</TableHead>
                    <TableHead>{t('Description')}</TableHead>
                    <TableHead>{t('Category')}</TableHead>
                    <TableHead className="text-right text-green-700">{t('In')}</TableHead>
                    <TableHead className="text-right text-red-700">{t('Out')}</TableHead>
                    <TableHead className="text-right">{t('Balance')}</TableHead>
                    <TableHead className="text-right">{t('Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id || entry._id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(new Date(entry.transactionDate), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getTypeBadge(entry.transactionType)}`}>
                          {getTypeLabel(entry.transactionType).split(' ')[0]}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate" title={entry.description}>
                        {entry.description}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {entry.category || '-'}
                      </TableCell>
                      <TableCell className="text-right text-green-600 font-medium">
                        {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}
                      </TableCell>
                      <TableCell className="text-right text-red-600 font-medium">
                        {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${entry.balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {formatCurrency(entry.balance)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => { setEditingEntry(entry); setShowForm(true); }}
                            title={t('Edit')}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDelete(entry)}
                            title={t('Delete')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <div className="text-sm text-muted-foreground">
                {t('Showing')} {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalResults)} {t('of')} {totalResults}
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>{t('First')}</Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>{t('Prev')}</Button>
                <span className="flex items-center px-3 text-sm text-muted-foreground">
                  {currentPage} / {totalPages}
                </span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>{t('Next')}</Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>{t('Last')}</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
