import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
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
  Receipt,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  X,
  CalendarIcon,
} from 'lucide-react';
import Axios from '@/utils/Axios';
import summery from '@/utils/summery';
import { toast } from 'sonner';
import { useDispatch } from 'react-redux';
import { mobileShopApi } from '@/stores/mobile-shop.api';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { useLanguage } from '@/context/language-context';
import { TransactionCategoryPicker } from './transaction-category-picker';
import {
  useCreateExpenseCategoryMutation,
  type ExpenseCategory,
  type TransactionCategoryType,
} from '@/stores/expenseCategory.api';
import {
  EMPTY_WALLET_CATEGORY_CATALOG,
  useWalletLedgerCategoryCatalog,
} from '../hooks/use-wallet-ledger-category-catalog';
import { mergeWalletCategoriesForPicker } from '../utils/merge-wallet-categories';

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

const formatCurrency = (value: number) =>
  `Rs ${Number(value || 0).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const UNCATEGORIZED = 'Uncategorized';

/** Treat blank / legacy uncategorized labels as "no category" on the entry */
const normalizeWalletCategoryName = (name?: string | null) => {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.toLowerCase() === UNCATEGORIZED.toLowerCase()) return '';
  return trimmed;
};

type CategoryFlow = 'income' | 'expense';

const isIncomeLedgerType = (type: string) =>
  type === 'income' || type === 'opening_balance';

function buildCategoryBreakdown(
  entries: LedgerEntry[],
  flow: CategoryFlow,
  resolveCategoryName: (entry: LedgerEntry) => string,
): CategoryBreakdown[] {
  const map = new Map<string, { totalAmount: number; expenseCount: number }>();
  for (const entry of entries) {
    if (flow === 'expense') {
      if (entry.transactionType !== 'expense' || !(entry.debit > 0)) continue;
    } else if (!isIncomeLedgerType(entry.transactionType) || !(entry.credit > 0)) {
      continue;
    }
    const amount = flow === 'expense' ? entry.debit : entry.credit;
    const cat = resolveCategoryName(entry);
    const existing = map.get(cat) || { totalAmount: 0, expenseCount: 0 };
    existing.totalAmount += amount;
    existing.expenseCount += 1;
    map.set(cat, existing);
  }
  return Array.from(map.entries())
    .map(([name, data]) => ({
      _id: name,
      totalAmount: data.totalAmount,
      expenseCount: data.expenseCount,
      avgAmount: data.expenseCount ? data.totalAmount / data.expenseCount : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

const CATEGORY_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#94a3b8',
];

interface CategoryBreakdown {
  _id: string;
  totalAmount: number;
  expenseCount: number;
  avgAmount: number;
}

function EntryForm({
  editingEntry,
  defaultCategory,
  defaultTransactionType,
  categoryNamesByType = {},
  categoryCatalogByType = EMPTY_WALLET_CATEGORY_CATALOG,
  isCategoryCatalogLoading = false,
  onCatalogRefresh,
  onSuccess,
  onCancel,
}: {
  editingEntry: LedgerEntry | null;
  defaultCategory?: string;
  defaultTransactionType?: string;
  categoryNamesByType?: Record<string, string[]>;
  categoryCatalogByType?: Record<string, ExpenseCategory[]>;
  isCategoryCatalogLoading?: boolean;
  onCatalogRefresh: (transactionType: TransactionCategoryType) => void;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [categoryError, setCategoryError] = useState('');
  const [createCategory] = useCreateExpenseCategoryMutation();
  const [form, setForm] = useState<EntryFormData>({
    transactionType: editingEntry?.transactionType || defaultTransactionType || 'income',
    transactionDate: editingEntry
      ? format(new Date(editingEntry.transactionDate), 'yyyy-MM-dd')
      : format(new Date(), 'yyyy-MM-dd'),
    description: editingEntry?.description || '',
    category: editingEntry?.category || defaultCategory || '',
    reference: editingEntry?.reference || '',
    amount: editingEntry ? String(editingEntry.credit || editingEntry.debit || '') : '',
    paymentMethod: editingEntry?.paymentMethod || '',
    notes: editingEntry?.notes || '',
  });

  useEffect(() => {
    if (!editingEntry) return;
    setForm({
      transactionType: editingEntry.transactionType || 'income',
      transactionDate: format(new Date(editingEntry.transactionDate), 'yyyy-MM-dd'),
      description: editingEntry.description || '',
      category: editingEntry.category?.trim() || '',
      reference: editingEntry.reference || '',
      amount: String(editingEntry.credit || editingEntry.debit || ''),
      paymentMethod: editingEntry.paymentMethod || '',
      notes: editingEntry.notes || '',
    });
    setCategoryError('');
  }, [editingEntry]);

  const isIncomeType = (type: string) => type === 'income' || type === 'opening_balance';

  const ensureWalletCategoryExists = async (
    name: string,
    transactionType: TransactionCategoryType,
  ) => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const catalog = categoryCatalogByType?.[transactionType] ?? [];
    if (catalog.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      return true;
    }
    try {
      await createCategory({ name: trimmed, transactionType }).unwrap();
      onCatalogRefresh(transactionType);
      return true;
    } catch (err: any) {
      const msg = String(err?.data?.message || '');
      if (err?.status === 409 || /already exists/i.test(msg)) {
        onCatalogRefresh(transactionType);
        return true;
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim()) {
      toast.error(t('Description is required'));
      return;
    }
    const categoryName = form.category.trim();
    if (!categoryName) {
      setCategoryError(t('Category is required'));
      toast.error(t('Category is required'));
      return;
    }
    setCategoryError('');

    const amount = parseFloat(form.amount);
    if (!form.amount || isNaN(amount) || amount <= 0) {
      toast.error(t('Please enter a valid amount'));
      return;
    }

    const txnType = form.transactionType as TransactionCategoryType;
    const categoryReady = await ensureWalletCategoryExists(categoryName, txnType);
    if (!categoryReady) {
      toast.error(t('Failed to save category'));
      return;
    }

    const isCredit = isIncomeType(form.transactionType);
    const payload = {
      transactionType: form.transactionType,
      transactionDate: new Date(form.transactionDate).toISOString(),
      description: form.description.trim(),
      category: categoryName,
      reference: form.reference.trim() || undefined,
      debit: isCredit ? 0 : amount,
      credit: isCredit ? amount : 0,
      paymentMethod: form.paymentMethod || undefined,
      notes: form.notes.trim() || undefined,
    };

    try {
      setLoading(true);
      if (editingEntry) {
        const entryId = editingEntry.id || editingEntry._id;
        await Axios.patch(`${summery.updatePersonalLedgerEntry.url}/${entryId}`, {
          transactionDate: payload.transactionDate,
          description: payload.description,
          category: categoryName,
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

  /** Same extra names in create and edit so the picker list always matches */
  const extraCategories = useMemo(() => {
    const names = new Set<string>();
    for (const name of categoryNamesByType[form.transactionType] ?? []) {
      const normalized = normalizeWalletCategoryName(name);
      if (normalized) names.add(normalized);
    }
    return Array.from(names);
  }, [categoryNamesByType, form.transactionType]);

  const categoryType = form.transactionType as TransactionCategoryType;
  const catalogForType = categoryCatalogByType[categoryType] ?? [];
  const walletCategoriesForPicker = useMemo(
    () =>
      mergeWalletCategoriesForPicker(
        catalogForType,
        extraCategories,
        form.category,
      ),
    [catalogForType, extraCategories, form.category],
  );

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
        <TransactionCategoryPicker
          key={`${categoryType}-${editingEntry?.id || editingEntry?._id || 'new'}`}
          transactionType={categoryType}
          value={form.category}
          apiCategories={walletCategoriesForPicker}
          walletMode
          categoriesLoading={isCategoryCatalogLoading}
          onCategoryCreated={onCatalogRefresh}
          required
          error={categoryError}
          onChange={(category) => {
            setCategoryError('');
            setForm((f) => ({ ...f, category }));
          }}
        />

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
  const dispatch = useDispatch();
  const {
    byType: categoryCatalogByType = EMPTY_WALLET_CATEGORY_CATALOG,
    isLoading: isCategoryCatalogLoading,
    refreshType: refreshWalletCategoryType,
  } = useWalletLedgerCategoryCatalog();
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
  const [categorySearch, setCategorySearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [startDate, setStartDate] = useState(format(new Date(new Date().setDate(new Date().getDate() - 30)), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [openingBalanceValue, setOpeningBalanceValue] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeCategoryFlow, setActiveCategoryFlow] = useState<CategoryFlow>('expense');
  const [categoryDetailEntries, setCategoryDetailEntries] = useState<LedgerEntry[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [formDefaults, setFormDefaults] = useState<{
    category: string;
    flow: CategoryFlow;
    transactionType: string;
  } | null>(null);
  const [allLedgerCategoryNamesByType, setAllLedgerCategoryNamesByType] = useState<
    Record<string, string[]>
  >({});

  const buildCategoryNamesByType = useCallback((ledgerRows: LedgerEntry[]) => {
    const map = new Map<string, Set<string>>();
    for (const entry of ledgerRows) {
      const name = entry.category?.trim();
      if (!name) continue;
      const type = entry.transactionType;
      if (!map.has(type)) map.set(type, new Set());
      map.get(type)!.add(name);
    }
    return Object.fromEntries(
      Array.from(map.entries()).map(([type, names]) => [type, Array.from(names).sort()]),
    );
  }, []);

  const fetchAllLedgerCategoryNames = useCallback(async () => {
    try {
      const response = await Axios.get(summery.fetchPersonalLedgerEntries.url, {
        params: {
          sortBy: 'transactionDate:desc',
          page: 1,
          limit: 10000,
        },
      });
      setAllLedgerCategoryNamesByType(
        buildCategoryNamesByType(response.data.results || []),
      );
    } catch {
      setAllLedgerCategoryNamesByType({});
    }
  }, [buildCategoryNamesByType]);

  useEffect(() => {
    fetchEntries();
    fetchReportEntries();
  }, [currentPage, pageSize, filterType, startDate, endDate]);

  useEffect(() => {
    fetchAllLedgerCategoryNames();
  }, [fetchAllLedgerCategoryNames]);

  useEffect(() => {
    if (!showForm) return;
    const type = (editingEntry?.transactionType || formDefaults?.transactionType || 'income') as TransactionCategoryType;
    refreshWalletCategoryType(type);
  }, [showForm, editingEntry?.transactionType, formDefaults?.transactionType, refreshWalletCategoryType]);

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

  const fetchReportEntries = async (): Promise<LedgerEntry[]> => {
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
      const results = response.data.results || [];
      setReportEntries(results);
      return results;
    } catch {
      toast.error(t('Failed to load report data'));
      return [];
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

  const invalidateCashBookCaches = () => {
    dispatch(mobileShopApi.util.invalidateTags(['CashBook', 'MobileDashboard']));
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
    fetchReportEntries();
  };

  const openEditEntry = useCallback(async (entry: LedgerEntry) => {
    const id = entry.id || entry._id;
    if (!id) {
      setEditingEntry(entry);
      setShowForm(true);
      return;
    }
    try {
      const { data } = await Axios.get(`${summery.fetchPersonalLedgerEntries.url}/${id}`);
      setEditingEntry(data);
    } catch {
      setEditingEntry(entry);
    }
    setShowForm(true);
  }, []);

  const handleDelete = async (entry: LedgerEntry) => {
    if (!confirm(t('Are you sure you want to delete this entry?'))) return;
    try {
      const id = entry.id || entry._id;
      await Axios.delete(`${summery.deletePersonalLedgerEntry.url}/${id}`);
      toast.success(t('Entry deleted successfully'));
      invalidateCashBookCaches();
      fetchAllLedgerCategoryNames();
      fetchEntries();
      fetchReportEntries();
      fetchOpeningBalance();
      fetchSummary();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('Failed to delete entry'));
    }
  };

  const handleFormSuccess = async () => {
    const reopen = formDefaults;
    setShowForm(false);
    setEditingEntry(null);
    setFormDefaults(null);
    setCurrentPage(1);
    invalidateCashBookCaches();
    fetchAllLedgerCategoryNames();
    fetchEntries();
    const updatedEntries = await fetchReportEntries();
    fetchOpeningBalance();
    fetchSummary();
    if (reopen) {
      openCategoryDetail(reopen.category, reopen.flow, updatedEntries);
    }
  };

  const resolveCategoryName = useCallback(
    (entry: LedgerEntry) => entry.category?.trim() || UNCATEGORIZED,
    [],
  );

  const categoryNamesByType = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const addNames = (byType: Record<string, string[]>) => {
      for (const [type, names] of Object.entries(byType)) {
        if (!map.has(type)) map.set(type, new Set());
        for (const name of names) map.get(type)!.add(name);
      }
    };
    addNames(allLedgerCategoryNamesByType);
    addNames(buildCategoryNamesByType(reportEntries));
    return Object.fromEntries(
      Array.from(map.entries()).map(([type, names]) => [type, Array.from(names).sort()]),
    );
  }, [allLedgerCategoryNamesByType, reportEntries, buildCategoryNamesByType]);

  const incomeCategoryBreakdown = useMemo(
    () => buildCategoryBreakdown(reportEntries, 'income', resolveCategoryName),
    [reportEntries, resolveCategoryName],
  );

  const expenseCategoryBreakdown = useMemo(
    () => buildCategoryBreakdown(reportEntries, 'expense', resolveCategoryName),
    [reportEntries, resolveCategoryName],
  );

  const totalWalletIncome = useMemo(
    () => incomeCategoryBreakdown.reduce((sum, c) => sum + c.totalAmount, 0),
    [incomeCategoryBreakdown],
  );

  const totalWalletExpenses = useMemo(
    () => expenseCategoryBreakdown.reduce((sum, c) => sum + c.totalAmount, 0),
    [expenseCategoryBreakdown],
  );

  const categorySearchTerm = categorySearch.trim().toLowerCase();

  const filteredIncomeCategoryBreakdown = useMemo(() => {
    if (!categorySearchTerm) return incomeCategoryBreakdown;
    return incomeCategoryBreakdown.filter((cat) =>
      cat._id.toLowerCase().includes(categorySearchTerm),
    );
  }, [incomeCategoryBreakdown, categorySearchTerm]);

  const filteredExpenseCategoryBreakdown = useMemo(() => {
    if (!categorySearchTerm) return expenseCategoryBreakdown;
    return expenseCategoryBreakdown.filter((cat) =>
      cat._id.toLowerCase().includes(categorySearchTerm),
    );
  }, [expenseCategoryBreakdown, categorySearchTerm]);

  const hasCategoryBreakdown =
    incomeCategoryBreakdown.length > 0 || expenseCategoryBreakdown.length > 0;

  const openCategoryDetail = useCallback(
    (catName: string, flow: CategoryFlow, entriesSource?: LedgerEntry[]) => {
      const source = entriesSource ?? reportEntries;
      setActiveCategory(catName);
      setActiveCategoryFlow(flow);
      setSheetOpen(true);
      setExpandedRows(new Set());
      const filtered = source.filter((entry) => {
        if (flow === 'expense') {
          if (entry.transactionType !== 'expense' || !(entry.debit > 0)) return false;
        } else if (!isIncomeLedgerType(entry.transactionType) || !(entry.credit > 0)) {
          return false;
        }
        return resolveCategoryName(entry) === catName;
      });
      setCategoryDetailEntries(filtered);
    },
    [reportEntries, resolveCategoryName],
  );

  const handleAddFromCategory = useCallback(() => {
    if (!activeCategory) return;
    setFormDefaults({
      category: activeCategory,
      flow: activeCategoryFlow,
      transactionType: activeCategoryFlow === 'income' ? 'income' : 'expense',
    });
    setEditingEntry(null);
    setSheetOpen(false);
    setShowForm(true);
  }, [activeCategory, activeCategoryFlow]);

  const toggleRow = useCallback((i: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, []);

  const toggleAllDetailRows = useCallback(() => {
    setExpandedRows((prev) => {
      if (prev.size === categoryDetailEntries.length) return new Set();
      return new Set(categoryDetailEntries.map((_, i) => i));
    });
  }, [categoryDetailEntries]);

  const categoryDetailTotal = useMemo(
    () =>
      categoryDetailEntries.reduce(
        (sum, e) =>
          sum + (activeCategoryFlow === 'expense' ? e.debit || 0 : e.credit || 0),
        0,
      ),
    [categoryDetailEntries, activeCategoryFlow],
  );

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
        { Metric: 'Total Money Out / Expense', Value: summary.totalDebit.toFixed(2) },
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

  const renderCategoryBreakdownCards = (
    items: CategoryBreakdown[],
    total: number,
    flow: CategoryFlow,
    accentColor: string,
  ) => {
    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
          <Receipt className="h-10 w-10 mb-2 opacity-30" />
          <p>{t('no_results_found')}</p>
        </div>
      );
    }

    return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {items.map((cat, idx) => {
        const share = total ? ((cat.totalAmount / total) * 100).toFixed(1) : '0';
        const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
        return (
          <button
            key={`${flow}-${cat._id}`}
            type="button"
            onClick={() => openCategoryDetail(cat._id, flow)}
            className="text-left rounded-xl border bg-card p-4 shadow-sm hover:shadow-md hover:border-primary/50 transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white text-xs font-bold"
                style={{ backgroundColor: color }}
              >
                {cat._id.charAt(0).toUpperCase()}
              </span>
              <Badge variant="secondary" className="text-xs">{share}%</Badge>
            </div>
            <p className="font-semibold text-sm leading-tight mb-0.5">{cat._id}</p>
            <p className="text-xl font-bold" style={{ color: accentColor }}>
              {formatCurrency(cat.totalAmount)}
            </p>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{cat.expenseCount} {t('entries')}</span>
              <span>{t('avg')} {formatCurrency(cat.avgAmount)}</span>
            </div>
            <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${share}%`, backgroundColor: color }}
              />
            </div>
            <p className="mt-1.5 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
              {t('Click to view details →')}
            </p>
          </button>
        );
      })}
    </div>
  );
  };

  return (
    <div className="space-y-4">
      {/* Date Range Filter */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wallet-start-date" className="text-sm font-medium">
                {t('start_date')}
              </Label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  id="wallet-start-date"
                  type="date"
                  value={startDate}
                  onChange={e => { setStartDate(e.target.value); setCurrentPage(1); }}
                  className="w-[180px] pl-9"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wallet-end-date" className="text-sm font-medium">
                {t('end_date')}
              </Label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  id="wallet-end-date"
                  type="date"
                  value={endDate}
                  onChange={e => { setEndDate(e.target.value); setCurrentPage(1); }}
                  className="w-[180px] pl-9"
                />
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() => {
                setStartDate(format(new Date(new Date().setDate(new Date().getDate() - 30)), 'yyyy-MM-dd'));
                setEndDate(format(new Date(), 'yyyy-MM-dd'));
                setCurrentPage(1);
              }}
            >
              {t('last_30_days')}
            </Button>
          </div>
        </CardContent>
      </Card>

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
                <p className="text-sm text-muted-foreground">{t('total_money_out_expense')}</p>
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

      {hasCategoryBreakdown && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={categorySearch}
            onChange={(e) => setCategorySearch(e.target.value)}
            placeholder={t('search_categories')}
            className="pl-9"
          />
        </div>
      )}

      {/* Income by category (Money In) */}
      {incomeCategoryBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('income_by_category')}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t('money_in_by_category')}
            </p>
          </CardHeader>
          <CardContent>
            {renderCategoryBreakdownCards(
              filteredIncomeCategoryBreakdown,
              totalWalletIncome,
              'income',
              '#16a34a',
            )}
          </CardContent>
        </Card>
      )}

      {/* Expenses by category (Money Out) */}
      {expenseCategoryBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('expense_by_category')}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t('money_out_by_category')}
            </p>
          </CardHeader>
          <CardContent>
            {renderCategoryBreakdownCards(
              filteredExpenseCategoryBreakdown,
              totalWalletExpenses,
              'expense',
              '#dc2626',
            )}
          </CardContent>
        </Card>
      )}

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
          <Button onClick={() => { setEditingEntry(null); setFormDefaults(null); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            {t('Add Entry')}
          </Button>
        </div>
      </div>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => {
        if (!open) {
          setEditingEntry(null);
          setFormDefaults(null);
        }
        setShowForm(open);
      }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingEntry ? t('Edit Entry') : t('Add Transaction')}</DialogTitle>
          </DialogHeader>
          {showForm && (
            <EntryForm
              key={`${editingEntry?.id || editingEntry?._id || 'new'}-${formDefaults?.category || ''}-${formDefaults?.transactionType || ''}`}
              editingEntry={editingEntry}
              defaultCategory={formDefaults?.category}
              defaultTransactionType={formDefaults?.transactionType}
              categoryNamesByType={categoryNamesByType}
              categoryCatalogByType={categoryCatalogByType}
              isCategoryCatalogLoading={isCategoryCatalogLoading}
              onCatalogRefresh={refreshWalletCategoryType}
              onSuccess={handleFormSuccess}
              onCancel={() => { setShowForm(false); setEditingEntry(null); setFormDefaults(null); }}
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
                      <TableCell className="text-sm">
                        {entry.category?.trim() ? (
                          <Badge variant="secondary" className="font-normal">
                            {entry.category.trim()}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
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
                            onClick={() => openEditEntry(entry)}
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

      {/* Category expense detail panel */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle className="text-lg">
                {activeCategory} —{' '}
                {activeCategoryFlow === 'income'
                  ? t('income_category_details')
                  : t('Expense Details')}
              </SheetTitle>
              <div className="flex items-center gap-1">
                {activeCategory && (
                  <Button size="sm" className="h-8 gap-1" onClick={handleAddFromCategory}>
                    <Plus className="h-3.5 w-3.5" />
                    {activeCategoryFlow === 'income' ? t('Add Income') : t('Add Expense')}
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => setSheetOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {!reportLoading && (
              <div className="flex items-center justify-between mt-2">
                <p className="text-sm text-muted-foreground">
                  {categoryDetailEntries.length} {t('entries')} · {formatCurrency(categoryDetailTotal)} {t('total')}
                </p>
                {categoryDetailEntries.length > 0 && (
                  <Button variant="outline" size="sm" onClick={toggleAllDetailRows} className="h-7 text-xs gap-1">
                    <ChevronsUpDown className="h-3 w-3" />
                    {expandedRows.size === categoryDetailEntries.length ? t('Collapse All') : t('Expand All')}
                  </Button>
                )}
              </div>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {reportLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : categoryDetailEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                <Receipt className="h-10 w-10 mb-2 opacity-30" />
                <p>
                  {activeCategoryFlow === 'income'
                    ? t('no_income_for_category')
                    : t('No expenses found for this category')}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>{t('Date')}</TableHead>
                    <TableHead>{t('Description')}</TableHead>
                    <TableHead>{t('Payment')}</TableHead>
                    <TableHead className="text-right">{t('Amount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryDetailEntries.map((entry, idx) => (
                    <Fragment key={entry.id || entry._id || idx}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleRow(idx)}
                      >
                        <TableCell className="py-2">
                          {expandedRows.has(idx)
                            ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                        </TableCell>
                        <TableCell className="py-2 text-sm whitespace-nowrap">
                          {format(new Date(entry.transactionDate), 'dd MMM yyyy')}
                        </TableCell>
                        <TableCell className="py-2 text-sm font-medium">{entry.description}</TableCell>
                        <TableCell className="py-2">
                          <Badge variant="outline" className="text-xs">
                            {entry.paymentMethod || '—'}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={`py-2 text-right font-semibold text-sm ${
                            activeCategoryFlow === 'income' ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {formatCurrency(
                            activeCategoryFlow === 'income' ? entry.credit : entry.debit,
                          )}
                        </TableCell>
                      </TableRow>
                      {expandedRows.has(idx) && (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell />
                          <TableCell colSpan={4} className="py-3 px-4">
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
                              <div>
                                <span className="font-medium text-foreground">{t('Reference')}: </span>
                                {entry.reference || '—'}
                              </div>
                              <div>
                                <span className="font-medium text-foreground">{t('Category')}: </span>
                                {entry.category || UNCATEGORIZED}
                              </div>
                              {entry.notes && (
                                <div className="col-span-2">
                                  <span className="font-medium text-foreground">{t('Notes')}: </span>
                                  {entry.notes}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="font-semibold">
                      {t('Total')}
                    </TableCell>
                    <TableCell
                      className={`text-right font-bold text-base ${
                        activeCategoryFlow === 'income' ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {formatCurrency(categoryDetailTotal)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </div>

          {categoryDetailEntries.length > 0 && (
            <div className="border-t px-6 py-4 flex-shrink-0">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">
                  {format(new Date(startDate), 'dd MMM yyyy')} — {format(new Date(endDate), 'dd MMM yyyy')}
                </span>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{t('Total Expense')}</p>
                  <p className="font-bold text-lg text-red-600">{formatCurrency(categoryDetailTotal)}</p>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
