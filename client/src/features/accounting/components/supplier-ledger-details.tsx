import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
} from '@/components/ui/table';
import { useLanguage } from '@/context/language-context';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/stores/store';
import { AppDispatch } from '@/stores/store';
import { useGetBranchQuery } from '@/stores/branch.api';
import { useGetMyOrganizationQuery } from '@/stores/organization.api';
import { ArrowLeft, Plus, Edit, Trash2, Download, Receipt, Printer, CalendarIcon, List, LayoutGrid, ExternalLink } from 'lucide-react';
import { PAPER_FORMATS, resolveThermalSize, resolveSheetSize, withPrintOrientation, type PaperSize, type PrintOrientation } from '@/features/invoice/utils/paper-format';
import type { InvoiceTemplate } from '@/features/invoice/utils/invoice-template';
import { PrintFormatButton } from '@/components/print-format-button';
import { expiryBadge } from '@/features/reports/utils/expiry-badge';
import { useNavigate } from '@tanstack/react-router';
import * as XLSX from 'xlsx';
import Axios from '@/utils/Axios';
import summery from '@/utils/summery';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { LedgerEntryForm } from './ledger-entry-form';
import { purchaseApi, useGetPurchaseByIdQuery } from '@/stores/purchase.api';
import { returnsApi, useGetPurchaseReturnByIdQuery } from '@/stores/returns.api';
import { PaymentReceipt } from './payment-receipt';
import { mobileShopApi, useGetLoadPurchaseByIdQuery } from '@/stores/mobile-shop.api';
import { getInvoicePrintInUrdu } from '@/features/invoice/utils/print-preferences';
import { printMobileShopReceipt } from '@/features/mobile-shop/utils/mobile-shop-print-utils';
import { supplierBalanceBeforeFromLedgerEntry } from '@/features/invoice/utils/invoice-print-balance';
import { LedgerStatementTable } from './ledger-statement-table';
import { LedgerCategoryCards, type LedgerCategoryGroup } from './ledger-category-cards';
import { LEDGER_STATEMENT_SORT, formatLedgerBalanceLabel, getLedgerBalanceTone } from '@/features/accounting/utils/ledger-display';
import {
  isManualLedgerEntry,
  isLoadPurchaseLedgerRow,
  groupSupplierLedgerEntries,
} from '@/features/accounting/utils/supplier-ledger-categories';
import {
  getSupplierLedgerEntryActions,
  getSupplierLedgerFormPreset,
} from '@/features/accounting/utils/supplier-ledger-entry-navigation';
import { cn } from '@/lib/utils';
import { WhatsAppSendButton } from '@/components/whatsapp/whatsapp-send-button'
import { SmsSendButton } from '@/components/sms/sms-send-button';
import { useBranchName } from '@/hooks/use-branch-name'
import { buildSupplierBalanceMessage, buildPaymentMadeMessage } from '@/utils/sms-messages'

interface LedgerEntry {
  _id?: string;
  id?: string;  // Backend returns 'id' not '_id'
  transactionType: string;
  transactionDate: string;
  description: string;
  reference?: string;
  referenceId?: string;  // Links to purchase invoice if auto-generated
  debit: number;
  credit: number;
  balance: number;
  paymentMethod?: string;
  invoiceType?: string;
}

function formatLedgerInvoiceType(entry: LedgerEntry, t: (key: string) => string): string {
  const raw = entry.invoiceType;
  if (!raw) return '—';
  const k = String(raw).toLowerCase();
  if (k === 'cash') return t('Cash');
  if (k === 'credit') return t('Credit');
  if (k === 'pending') return t('Pending');
  return raw;
}

interface SupplierLedgerDetailsProps {
  supplier: any;
  onBack: () => void;
  initialLedgerEntry?: string;
}

// Purchase dialog content component
function PurchaseDialogContent({ purchaseId, supplierName }: { purchaseId?: string; supplierName: string }) {
  const { t } = useLanguage();

  if (!purchaseId) {
    return <div className="text-center py-8 text-gray-500">{t('No purchase selected')}</div>;
  }

  const { data: purchaseData, isLoading, error } = useGetPurchaseByIdQuery(purchaseId);

  if (isLoading) {
    return <div className="text-center py-8 text-gray-500">{t('Loading...')}</div>;
  }

  if (error || !purchaseData) {
    return <div className="text-center py-8 text-red-500">{t('Failed to load purchase details')}</div>;
  }

  const formatDate = (date: any) => {
    try {
      if (!date) return '-';
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) return '-';
      return format(dateObj, 'MMM dd, yyyy');
    } catch {
      return '-';
    }
  };

  const formatCurrency = (amount: any) => {
    const num = Number(amount);
    return isNaN(num) ? '0.00' : num.toFixed(2);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-gray-500">{t('Invoice Number')}</p>
          <p className="font-medium">{purchaseData.invoiceNumber || '-'}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">{t('Date')}</p>
          <p className="font-medium">{formatDate(purchaseData.date || purchaseData.purchaseDate)}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">{t('Supplier')}</p>
          <p className="font-medium">{purchaseData.supplierName || purchaseData.supplier?.name || supplierName}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">{t('Total Amount')}</p>
          <p className="font-medium text-lg">Rs{formatCurrency(purchaseData.totalAmount || purchaseData.total)}</p>
        </div>
      </div>
      <div>
        <p className="text-sm text-gray-500 mb-2">{t('Items')}</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Product')}</TableHead>
              <TableHead>Variant</TableHead>
              <TableHead>Batch #</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>{t('Quantity')}</TableHead>
              <TableHead>{t('price')}</TableHead>
              <TableHead className="text-right">{t('Total')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchaseData.items && purchaseData.items.length > 0 ? (
              purchaseData.items.map((item: any, index: number) => {
                const variantLabel = item.variantId?.attributes
                  ? Object.values(item.variantId.attributes).join(' / ')
                  : ''
                return (
                <TableRow key={index}>
                  <TableCell>{item.name || item.product?.name || item.productName || '-'}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{variantLabel || '—'}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{item.batchNumber || '—'}</TableCell>
                  <TableCell>{expiryBadge(item.expiryDate)}</TableCell>
                  <TableCell>{item.quantity || 0}</TableCell>
                  <TableCell>Rs{formatCurrency(item.unitPrice || item.price)}</TableCell>
                  <TableCell className="text-right">Rs{formatCurrency(item.subtotal || item.total)}</TableCell>
                </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-500">{t('No items')}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PurchaseReturnDialogContent({
  purchaseReturnId,
  fallbackSupplierName,
}: {
  purchaseReturnId?: string;
  fallbackSupplierName: string;
}) {
  const { t } = useLanguage();

  if (!purchaseReturnId) {
    return <div className="text-center py-8 text-gray-500">{t('No transaction selected')}</div>;
  }

  const { data: pr, isLoading, error } = useGetPurchaseReturnByIdQuery(purchaseReturnId);

  if (isLoading) {
    return <div className="text-center py-8 text-gray-500">{t('Loading...')}</div>;
  }

  if (error || !pr) {
    return <div className="text-center py-8 text-red-500">{t('Failed to load purchase return details')}</div>;
  }

  const formatDate = (date: unknown) => {
    try {
      if (!date) return '-';
      const dateObj = new Date(date as string);
      if (isNaN(dateObj.getTime())) return '-';
      return format(dateObj, 'MMM dd, yyyy');
    } catch {
      return '-';
    }
  };

  const formatCurrency = (amount: unknown) => {
    const num = Number(amount);
    return isNaN(num) ? '0.00' : num.toFixed(2);
  };

  const supplierLabel =
    (typeof pr.supplierId === 'object' && pr.supplierId != null && 'name' in pr.supplierId
      ? String((pr.supplierId as { name?: string }).name || '')
      : '') || fallbackSupplierName;

  const purchaseLabel =
    typeof pr.purchaseId === 'object' && pr.purchaseId != null && 'invoiceNumber' in pr.purchaseId
      ? String((pr.purchaseId as { invoiceNumber?: string }).invoiceNumber || '')
      : typeof pr.purchaseId === 'string'
        ? pr.purchaseId
        : '';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-gray-500">{t('Return Number')}</p>
          <p className="font-medium">{pr.returnNumber || '-'}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">{t('Date')}</p>
          <p className="font-medium">{formatDate(pr.date || pr.createdAt)}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">{t('Supplier')}</p>
          <p className="font-medium">{supplierLabel}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">{t('Total Amount')}</p>
          <p className="font-medium text-lg">Rs{formatCurrency(pr.totalAmount)}</p>
        </div>
        {purchaseLabel ? (
          <div>
            <p className="text-sm text-gray-500">{t('Invoice Number')}</p>
            <p className="font-medium">{purchaseLabel}</p>
          </div>
        ) : null}
        <div>
          <p className="text-sm text-gray-500">{t('Refund method')}</p>
          <Badge variant="outline">{pr.refundMethod || '—'}</Badge>
        </div>
        <div>
          <p className="text-sm text-gray-500">{t('Status')}</p>
          <Badge>{pr.status || 'N/A'}</Badge>
        </div>
        {pr.reason?.trim() ? (
          <div className="col-span-2">
            <p className="text-sm text-gray-500">{t('Reason')}</p>
            <p className="font-medium">{pr.reason}</p>
          </div>
        ) : null}
      </div>
      <div>
        <p className="text-sm text-gray-500 mb-2">{t('Items')}</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Product')}</TableHead>
              <TableHead>{t('Quantity')}</TableHead>
              <TableHead>{t('price')}</TableHead>
              <TableHead className="text-right">{t('Total')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pr.items && pr.items.length > 0 ? (
              pr.items.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>{item.name || '-'}</TableCell>
                  <TableCell>{item.quantity ?? 0}</TableCell>
                  <TableCell>Rs{formatCurrency(item.costPrice)}</TableCell>
                  <TableCell className="text-right">Rs{formatCurrency(item.total)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-gray-500">
                  {t('No items')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function LoadPurchaseDetailDialogContent({
  loadPurchaseId,
  fallbackSupplierName,
}: {
  loadPurchaseId?: string;
  fallbackSupplierName: string;
}) {
  const { t } = useLanguage();

  if (!loadPurchaseId) {
    return <div className="text-center py-8 text-gray-500">{t('No transaction selected')}</div>;
  }

  const { data: lp, isLoading, error } = useGetLoadPurchaseByIdQuery(loadPurchaseId);

  if (isLoading) {
    return <div className="text-center py-8 text-gray-500">{t('Loading...')}</div>;
  }

  if (error || !lp) {
    return (
      <div className="text-center py-8 text-red-500">{t('Failed to load load purchase details')}</div>
    );
  }

  const fmt = (n: unknown) => {
    const x = Number(n);
    return Number.isFinite(x) ? x.toFixed(2) : '0.00';
  };
  const fmtDate = (d: unknown) => {
    try {
      if (!d) return '—';
      const dt = new Date(d as string);
      return isNaN(dt.getTime()) ? '—' : format(dt, 'MMM dd, yyyy HH:mm');
    } catch {
      return '—';
    }
  };

  const supplierLabel = lp.supplierName?.trim() || fallbackSupplierName;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('Load purchase')}</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">{t('Reference')}</p>
            <p className="font-mono text-sm font-medium">{String(lp.id).slice(-12).toUpperCase()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('Date')}</p>
            <p className="font-medium">{fmtDate(lp.date)}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">{t('Wallet')}</p>
            <p className="font-medium">{lp.walletType}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="col-span-2">
          <p className="text-xs text-muted-foreground">{t('Supplier')}</p>
          <p className="font-medium">{supplierLabel}</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('Amounts')}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">{t('Amount')}</p>
            <p className="font-medium">Rs{fmt(lp.amount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('Paid')}</p>
            <p className="font-medium">Rs{fmt(lp.paidAmount ?? 0)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('Commission rate')}</p>
            <p className="font-medium">{fmt(lp.commissionRate)}%</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('Extra charge')}</p>
            <p className="font-medium">Rs{fmt(lp.extraCharge)}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">{t('Profit')}</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">Rs{fmt(lp.profit)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function getDefaultLedgerDateRange() {
  const now = new Date();
  return {
    startDate: format(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30), 'yyyy-MM-dd'),
    endDate: format(now, 'yyyy-MM-dd'),
  };
}

const SUPPLIER_LEDGER_VIEW_MODE_KEY = 'supplier-ledger-view-mode';

type LedgerViewMode = 'list' | 'category';

function getStoredLedgerViewMode(): LedgerViewMode {
  try {
    const stored = localStorage.getItem(SUPPLIER_LEDGER_VIEW_MODE_KEY);
    if (stored === 'list' || stored === 'category') return stored;
  } catch {
    /* ignore */
  }
  return 'list';
}

function storeLedgerViewMode(mode: LedgerViewMode) {
  try {
    localStorage.setItem(SUPPLIER_LEDGER_VIEW_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function SupplierLedgerDetails({ supplier, onBack, initialLedgerEntry }: SupplierLedgerDetailsProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId);
  const branchName = useBranchName();
  const preferredLanguage = useSelector((state: RootState) => state.auth.data?.user?.preferredLanguage || 'en');
  const user = useSelector((state: RootState) => state.auth.data?.user);
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId });
  const { data: orgData } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId });
  const defaultPaperSize: PaperSize = branchData?.printSettings?.paperSize ?? 'thermal80';
  const invoiceTemplate: InvoiceTemplate = branchData?.printSettings?.template ?? 'standard';
  const printOrientation: PrintOrientation = branchData?.printSettings?.printOrientation ?? 'portrait';
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [viewingPurchase, setViewingPurchase] = useState<any>(null);
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [viewingPurchaseReturnId, setViewingPurchaseReturnId] = useState<string | null>(null);
  const [purchaseReturnDialogOpen, setPurchaseReturnDialogOpen] = useState(false);
  const [viewingLoadPurchaseId, setViewingLoadPurchaseId] = useState<string | null>(null);
  const [loadPurchaseDialogOpen, setLoadPurchaseDialogOpen] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [dateRange, setDateRange] = useState(getDefaultLedgerDateRange);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [printingRowId, setPrintingRowId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<LedgerViewMode>(getStoredLedgerViewMode);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [activeCategoryGroup, setActiveCategoryGroup] = useState<LedgerCategoryGroup | null>(null);
  const [ledgerFormPreset, setLedgerFormPreset] = useState<{
    transactionType: string;
    paymentMethod?: string;
  } | null>(null);

  useEffect(() => {
    fetchLedgerEntries();
    fetchSupplierBalance();
  }, [supplier._id, dateRange.startDate, dateRange.endDate]);

  const fetchLedgerEntries = async () => {
    try {
      setLoading(true);
      const response = await Axios.get(summery.fetchSupplierLedgerEntries.url, {
        params: {
          supplier: supplier._id,
          sortBy: LEDGER_STATEMENT_SORT,
          page: 1,
          limit: 5000,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        },
      });
      setEntries(response.data.results || []);
      setOpeningBalance(Number(response.data.openingBalance ?? response.data.balanceBeforePage) || 0);
      setTotalResults(response.data.totalResults || 0);
    } catch (error: any) {
      toast.error(t('Failed to load ledger entries'));
      console.error('Error fetching ledger entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    try {
      const data = entries.map(entry => ({
        'Date': format(new Date(entry.transactionDate), 'MMM dd, yyyy'),
        'Type': getTransactionTypeLabel(entry),
        'Description': entry.description,
        'Reference': entry.reference || '-',
        'Invoice Type': formatLedgerInvoiceType(entry, t),
        'Debit': entry.debit > 0 ? entry.debit.toFixed(2) : '-',
        'Credit': entry.credit > 0 ? entry.credit.toFixed(2) : '-',
        'Balance': entry.balance.toFixed(2)
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Ledger');
      XLSX.writeFile(wb, `${supplier.name}-ledger-${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success(t('Data exported successfully'));
    } catch (error) {
      console.error('Export error:', error);
      toast.error(t('Failed to export data'));
    }
  };

  const fetchSupplierBalance = async () => {
    try {
      setBalanceLoading(true);
      const url = `${summery.fetchSupplierBalance.url}/${supplier._id}${summery.fetchSupplierBalance.urlSuffix || ''}`;
      const response = await Axios.get(url);
      setCurrentBalance(response.data.balance || 0);
    } catch (error: any) {
      console.error('Failed to fetch supplier balance:', error);
      setCurrentBalance(supplier.balance || 0);
    } finally {
      setBalanceLoading(false);
    }
  };

  const handleEditEntry = (entry: LedgerEntry) => {
    setEditingEntry(entry);
    setShowEntryForm(true);
  };

  const handleCloseForm = () => {
    setShowEntryForm(false);
    setEditingEntry(null);
    setLedgerFormPreset(null);
  };

  const handleDeleteEntry = async (entry: LedgerEntry) => {
    if (!confirm(t('Are you sure you want to delete this entry? This action cannot be undone.'))) {
      return;
    }

    try {
      const entryId = entry.id || entry._id;
      await Axios.delete(`${summery.deleteSupplierLedgerEntry.url}/${entryId}`);
      dispatch(mobileShopApi.util.invalidateTags(['Wallets', 'MobileDashboard']));
      toast.success(t('Ledger entry deleted successfully'));
      fetchLedgerEntries();
      fetchSupplierBalance();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('Failed to delete ledger entry'));
      console.error('Error deleting ledger entry:', error);
    }
  };

  const handleViewLinkedSupplierEntry = (entry: LedgerEntry) => {
    const id = entry.referenceId != null ? String(entry.referenceId) : '';
    if (!id) return;
    if (entry.transactionType === 'purchase_return') {
      setViewingPurchaseReturnId(id);
      setPurchaseReturnDialogOpen(true);
      return;
    }
    if (isLoadPurchaseLedgerRow(entry)) {
      setViewingLoadPurchaseId(id);
      setLoadPurchaseDialogOpen(true);
      return;
    }
    setViewingPurchase({ id });
    setPurchaseDialogOpen(true);
  };

  const handleGenerateReceipt = (entry: LedgerEntry) => {
    const entryIndex = entries.findIndex(e => (e.id || e._id) === (entry.id || entry._id));
    const previousBalance =
      entryIndex > 0
        ? entries[entryIndex - 1].balance
        : supplierBalanceBeforeFromLedgerEntry(entry);

    setSelectedPayment({
      entry,
      previousBalance,
      currentBalance: entry.balance,
    });
    setReceiptDialogOpen(true);
  };

  const isManualEntry = isManualLedgerEntry;

  const periodSummary = useMemo(() => {
    const periodDebit = entries.reduce((sum, entry) => sum + (Number(entry.debit) || 0), 0);
    const periodCredit = entries.reduce((sum, entry) => sum + (Number(entry.credit) || 0), 0);
    const closingBalance = entries.length > 0
      ? entries[entries.length - 1].balance
      : openingBalance;
    return { periodDebit, periodCredit, closingBalance };
  }, [entries, openingBalance]);

  const applyLast30Days = () => setDateRange(getDefaultLedgerDateRange());

  const categoryGroups = useMemo(() => groupSupplierLedgerEntries(entries), [entries]);

  const totalCategoryActivity = useMemo(
    () => categoryGroups.reduce((sum, group) => sum + group.totalDebit + group.totalCredit, 0),
    [categoryGroups],
  );

  const openCategorySheet = (group: LedgerCategoryGroup) => {
    setActiveCategoryGroup(group);
    setCategorySheetOpen(true);
  };

  const categoryEntryActions = useMemo(
    () =>
      activeCategoryGroup
        ? getSupplierLedgerEntryActions(activeCategoryGroup.category, supplier._id)
        : [],
    [activeCategoryGroup, supplier._id],
  );

  const handleNavigateEntry = (action: ReturnType<typeof getSupplierLedgerEntryActions>[number]) => {
    setCategorySheetOpen(false);
    navigate({ to: action.to, search: action.search as any });
  };

  const handleOpenLedgerEntryForm = (categoryKey: string) => {
    const preset = getSupplierLedgerFormPreset(categoryKey);
    if (!preset) return;
    setLedgerFormPreset(preset);
    setEditingEntry(null);
    setCategorySheetOpen(false);
    setShowEntryForm(true);
  };

  useEffect(() => {
    if (!initialLedgerEntry) return;
    handleOpenLedgerEntryForm(initialLedgerEntry);
  }, [initialLedgerEntry]);

  const handleViewModeChange = (mode: LedgerViewMode) => {
    setViewMode(mode);
    storeLedgerViewMode(mode);
  };

  const canPrintLinkedSupplierEntry = (entry: LedgerEntry) =>
    Boolean(entry.referenceId) &&
    !isManualEntry(entry) &&
    (entry.transactionType === 'purchase' ||
      entry.transactionType === 'payment_made' ||
      entry.transactionType === 'purchase_return');

  const usesPurchaseA4Print = (entry: LedgerEntry) =>
    canPrintLinkedSupplierEntry(entry) &&
    entry.transactionType !== 'purchase_return' &&
    !isLoadPurchaseLedgerRow(entry);

  const handlePrintLinkedPurchase = async (entry: LedgerEntry, paperSize: PaperSize = defaultPaperSize) => {
    const id = entry.referenceId ? String(entry.referenceId) : '';
    const rowId = String(entry.id || entry._id || '');
    if (!id || !rowId) return;
    setPrintingRowId(rowId);
    try {
      if (entry.transactionType === 'purchase_return') {
        const pr = await dispatch(returnsApi.endpoints.getPurchaseReturnById.initiate(id)).unwrap();
        const fmtRs = (n: number) => `Rs${Number(n ?? 0).toFixed(2)}`;
        const sup =
          (typeof pr.supplierId === 'object' && pr.supplierId != null && 'name' in pr.supplierId
            ? String((pr.supplierId as { name?: string }).name || '')
            : '') ||
          supplier.name ||
          '—';
        const purchaseRef =
          typeof pr.purchaseId === 'object' && pr.purchaseId != null && 'invoiceNumber' in pr.purchaseId
            ? String((pr.purchaseId as { invoiceNumber?: string }).invoiceNumber || '')
            : typeof pr.purchaseId === 'string'
              ? pr.purchaseId
              : '';
        const itemLines =
          pr.items?.map((it) => ({
            label: `${it.name} × ${it.quantity}`,
            value: fmtRs(it.total),
          })) ?? [];
        printMobileShopReceipt(
          {
            title: 'Purchase return',
            reference: pr.returnNumber,
            issuedAt: pr.date ? new Date(pr.date).toLocaleString() : new Date(pr.createdAt).toLocaleString(),
            lines: [
              { label: 'Supplier', value: sup },
              ...(purchaseRef ? [{ label: 'Purchase', value: purchaseRef }] : []),
              ...itemLines,
              { label: 'Total', value: fmtRs(pr.totalAmount) },
              ...(pr.reason?.trim() ? [{ label: 'Reason', value: pr.reason }] : []),
            ],
          },
          orgData,
          branchData?.invoiceNote ?? undefined,
        );
        toast.success(t('print_invoice_btn'));
        return;
      }

      if (isLoadPurchaseLedgerRow(entry)) {
        const lp = await dispatch(mobileShopApi.endpoints.getLoadPurchaseById.initiate(id)).unwrap();
        const fmtRs = (n: number) => `Rs${Number(n ?? 0).toFixed(2)}`;
        printMobileShopReceipt(
          {
            title: 'Load purchase',
            reference: String(lp.id).slice(-10).toUpperCase(),
            issuedAt: new Date(lp.date).toLocaleString(),
            lines: [
              { label: 'Wallet', value: lp.walletType },
              { label: 'Amount', value: fmtRs(lp.amount) },
              { label: 'Paid', value: fmtRs(lp.paidAmount ?? 0) },
              ...(lp.supplierName ? [{ label: 'Supplier', value: lp.supplierName }] : []),
              { label: 'Commission %', value: `${Number(lp.commissionRate ?? 0).toFixed(2)}%` },
              { label: 'Extra charge', value: fmtRs(lp.extraCharge) },
              { label: 'Profit', value: fmtRs(lp.profit) },
            ],
          },
          orgData,
          branchData?.invoiceNote ?? undefined,
        );
        toast.success(t('print_invoice_btn'));
        return;
      }

      const purchase = await dispatch(purchaseApi.endpoints.getPurchaseById.initiate(id)).unwrap();
      const printModule = await import('@/utils/purchasePrintUtils');
      const branchDetails = {
        name: orgData?.name || branchData?.name,
        nameUrdu: branchData?.nameUrdu?.trim() || orgData?.nameUrdu?.trim(),
        address: [branchData?.location?.address, branchData?.location?.city, branchData?.location?.country]
          .filter(Boolean)
          .join(', '),
        phone: branchData?.phone,
        email: branchData?.email,
        logo: orgData?.logo?.url,
        isTrial: orgData?.subscription?.isTrial,
        invoiceNote: branchData?.invoiceNote,
      };
      const sheetSize = withPrintOrientation(resolveSheetSize(paperSize), printOrientation);
      const format = PAPER_FORMATS[withPrintOrientation(paperSize, printOrientation)];
      const html =
        format.family === 'thermal'
          ? printModule.generatePurchaseInvoiceHTML(
              purchase,
              purchase?.supplier?.name || supplier.name,
              t,
              branchDetails,
              preferredLanguage,
              getInvoicePrintInUrdu(),
              resolveThermalSize(paperSize),
            )
          : printModule.generatePurchaseInvoiceA4HTML(
              purchase,
              purchase?.supplier?.name || supplier.name,
              t,
              branchDetails,
              preferredLanguage,
              getInvoicePrintInUrdu(),
              sheetSize,
              invoiceTemplate,
            );
      const w = window.open('', '_blank', `width=${format.popup.width},height=${format.popup.height},scrollbars=yes,resizable=yes`);
      if (w) {
        w.document.write(html);
        w.document.close();
        w.print();
      }
      toast.success(t('print_invoice_btn'));
    } catch (e) {
      console.error(e);
      toast.error(t('print_error'));
    } finally {
      setPrintingRowId(null);
    }
  };

  const getTransactionTypeLabel = (entry: LedgerEntry) => {
    const type = entry.transactionType;
    const manual = isManualEntry(entry);

    if (type === 'purchase') {
      return manual ? t('Cash Received') : t('Purchase');
    }
    if (type === 'payment_made') {
      return manual ? t('Cash Paid') : t('Payment Made');
    }
    if (type === 'payment_received') {
      return manual ? t('Cash Received') : t('Payment Received');
    }

    const labels: Record<string, string> = {
      purchase_return: t('Purchase Return'),
      debit_note: t('Debit Note'),
      credit_note: t('Credit Note'),
      adjustment: t('Adjustment'),
      opening_balance: t('Opening Balance'),
    };
    return labels[type] || type;
  };

  const getTransactionTypeBadge = (type: string) => {
    const variants: Record<string, any> = {
      purchase: 'default',
      payment_made: 'default',
      purchase_return: 'secondary',
      debit_note: 'secondary',
      credit_note: 'secondary',
      adjustment: 'outline',
      opening_balance: 'outline',
    };
    return variants[type] || 'outline';
  };

  const getBalanceColor = (balance: number) => {
    if (balance > 0) return 'text-red-600 font-semibold';
    if (balance < 0) return 'text-green-600 font-semibold';
    return 'text-gray-600';
  };

  const renderLedgerActions = (entry: LedgerEntry) => (
    <div className="flex justify-end gap-1 flex-nowrap items-center shrink-0">
      {canPrintLinkedSupplierEntry(entry) && (
        usesPurchaseA4Print(entry) ? (
          <PrintFormatButton
            size="sm"
            defaultPaperSize={defaultPaperSize}
            disabled={printingRowId === String(entry.id || entry._id)}
            onPrint={(paperSize) => handlePrintLinkedPurchase(entry, paperSize)}
            label=""
          />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handlePrintLinkedPurchase(entry)}
            disabled={printingRowId === String(entry.id || entry._id)}
            className="h-8 w-8 p-0"
            title={t('print_invoice_btn')}
          >
            <Printer className="w-4 h-4 text-slate-700" />
          </Button>
        )
      )}
      {entry.transactionType === 'payment_made' && entry.debit > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleGenerateReceipt(entry)}
          className="h-8 w-8 p-0"
          title={t('Generate Receipt')}
        >
          <Receipt className="w-4 h-4 text-blue-600" />
        </Button>
      )}
      {isManualEntry(entry) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleEditEntry(entry)}
          className="h-8 w-8 p-0"
          title={t('Edit entry')}
        >
          <Edit className="w-4 h-4" />
        </Button>
      )}
      {isManualEntry(entry) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleDeleteEntry(entry)}
          title={t('Delete entry')}
          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </div>
  );

  const renderLedgerReference = (entry: LedgerEntry) =>
    entry.referenceId ? (
      <Button
        variant="link"
        className="h-auto p-0 font-normal text-blue-600 hover:text-blue-800"
        onClick={() => handleViewLinkedSupplierEntry(entry)}
      >
        {entry.reference || entry.referenceId}
      </Button>
    ) : (
      entry.reference || '—'
    );

  const renderStatementTable = (
    tableEntries: LedgerEntry[],
    options?: { showOpeningBalance?: boolean; pageOffset?: number },
  ) => (
    <LedgerStatementTable
      party="supplier"
      entries={tableEntries}
      balanceBeforePage={openingBalance}
      pageOffset={options?.pageOffset ?? 0}
      showOpeningBalance={options?.showOpeningBalance ?? false}
      openingBalanceLabel={t('Opening Balance')}
      t={t}
      getTypeLabel={getTransactionTypeLabel}
      getTypeBadgeVariant={getTransactionTypeBadge}
      formatInvoiceType={(entry) => formatLedgerInvoiceType(entry, t)}
      renderReference={renderLedgerReference}
      renderActions={renderLedgerActions}
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end sm:justify-between sm:flex-row flex-col gap-4">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('Back to Suppliers')}
        </Button>
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="sm" onClick={exportToExcel}>
            <Download className="w-4 h-4 mr-2" />
            {t('Export')}
          </Button>
          <Button onClick={() => setShowEntryForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {t('Add Entry')}
          </Button>
        </div>
      </div>

      <Dialog open={showEntryForm} onOpenChange={(open) => {
        if (!open) handleCloseForm();
        setShowEntryForm(open);
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingEntry ? t('Edit Ledger Entry') : t('Add Ledger Entry')}
            </DialogTitle>
          </DialogHeader>
          {showEntryForm && (
            <LedgerEntryForm
              key={`${editingEntry?.id || editingEntry?._id || 'new'}-${ledgerFormPreset?.transactionType || ''}`}
              ledgerType="supplier"
              entityId={supplier._id}
              entityName={supplier.name}
              editingEntry={editingEntry}
              defaultTransactionType={ledgerFormPreset?.transactionType}
              defaultPaymentMethod={ledgerFormPreset?.paymentMethod}
              onSuccess={(createdEntry) => {
                handleCloseForm();
                fetchLedgerEntries();
                fetchSupplierBalance();

                // Auto-generate receipt for payment made
                if (createdEntry && createdEntry.transactionType === 'payment_made') {
                  setTimeout(() => {
                    const previousBalance = currentBalance || 0;
                    const newBalance = previousBalance - createdEntry.debit;

                    setSelectedPayment({
                      entry: createdEntry,
                      previousBalance: previousBalance,
                      currentBalance: newBalance,
                    });
                    setReceiptDialogOpen(true);
                  }, 500);
                }
              }}
              onCancel={handleCloseForm}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={purchaseDialogOpen} onOpenChange={setPurchaseDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('Purchase Details')}</DialogTitle>
          </DialogHeader>
          <PurchaseDialogContent purchaseId={viewingPurchase?.id} supplierName={supplier.name} />
        </DialogContent>
      </Dialog>

      <Dialog
        open={purchaseReturnDialogOpen}
        onOpenChange={(open) => {
          setPurchaseReturnDialogOpen(open);
          if (!open) setViewingPurchaseReturnId(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('Purchase Return')}</DialogTitle>
          </DialogHeader>
          <PurchaseReturnDialogContent
            purchaseReturnId={viewingPurchaseReturnId ?? undefined}
            fallbackSupplierName={supplier.name}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={loadPurchaseDialogOpen}
        onOpenChange={(open) => {
          setLoadPurchaseDialogOpen(open);
          if (!open) setViewingLoadPurchaseId(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('Load purchase details')}</DialogTitle>
          </DialogHeader>
          <LoadPurchaseDetailDialogContent
            loadPurchaseId={viewingLoadPurchaseId ?? undefined}
            fallbackSupplierName={supplier.name}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('Payment Receipt')}</DialogTitle>
          </DialogHeader>
          {selectedPayment && (
            <PaymentReceipt
              customer={{
                name: supplier.name,
                nameUrdu: supplier.nameUrdu,
                phone: supplier.phone,
                address: supplier.address,
              }}
              payment={{
                amount: selectedPayment.entry.debit,
                date: selectedPayment.entry.transactionDate,
                reference: selectedPayment.entry.reference,
                paymentMethod: selectedPayment.entry.paymentMethod,
                description: selectedPayment.entry.description,
              }}
              balance={{
                previousBalance: selectedPayment.previousBalance,
                currentBalance: selectedPayment.currentBalance,
              }}
              company={{
                name: branchData?.name || orgData?.name || 'Logix Plus Solutions',
                nameUrdu: branchData?.nameUrdu?.trim() || orgData?.nameUrdu?.trim(),
                address: [branchData?.location?.address, branchData?.location?.city, branchData?.location?.country]
                  .filter((v) => v != null && String(v).trim() !== '')
                  .join(', '),
                addressUrdu: [
                  branchData?.location?.addressUrdu?.trim(),
                  branchData?.location?.city,
                  branchData?.location?.country,
                ]
                  .filter((v) => v != null && String(v).trim() !== '')
                  .join(', '),
                phone: branchData?.phone,
                email: branchData?.email,
                logo: orgData?.logo?.url,
              }}
              receiptNumber={selectedPayment.entry.reference || `RCP-${format(new Date(selectedPayment.entry.transactionDate), 'yyyyMMdd')}-${(selectedPayment.entry.id || selectedPayment.entry._id)?.slice(-6)}`}
              userPreferredLanguage={preferredLanguage as 'en' | 'ur'}
              isTrial={orgData?.subscription?.isTrial}
            />
          )}
          {selectedPayment && supplier.phone && (
            <div className="mt-3 flex items-center gap-2 border-t pt-3">
              <span className="text-sm text-muted-foreground">Send payment confirmation via SMS:</span>
              <SmsSendButton
                phone={supplier.phone}
                name={supplier.name}
                showLabel
                size="sm"
                variant="outline"
                defaultMessage={buildPaymentMadeMessage({
                  branchName,
                  name: supplier.name,
                  amount: selectedPayment.entry.debit,
                  remainingBalance: selectedPayment.currentBalance,
                })}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {supplier.name}
            {(supplier.phone || (supplier as { whatsapp?: string }).whatsapp) && (
              <>
                <WhatsAppSendButton
                  phone={supplier.phone}
                  whatsapp={(supplier as { whatsapp?: string }).whatsapp}
                  name={supplier.name}
                  showLabel
                  size="sm"
                  variant="outline"
                  message={buildSupplierBalanceMessage({ branchName, name: supplier.name, balance: currentBalance ?? supplier.balance })}
                />
                <SmsSendButton
                  phone={supplier.phone}
                  name={supplier.name}
                  showLabel
                  size="sm"
                  variant="outline"
                  defaultMessage={buildSupplierBalanceMessage({ branchName, name: supplier.name, balance: currentBalance ?? supplier.balance })}
                />
              </>
            )}
          </CardTitle>
          <CardDescription>
            <span className='block'>{t('Transaction History and Balance')}</span>
            {(supplier.phone || supplier.email) && (
              <span className='mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground'>
                {supplier.phone ? (
                  <span className="flex items-center gap-1">
                    {t('phone')}: {supplier.phone}
                  </span>
                ) : null}
                {supplier.email ? (
                  <span>
                    {t('email')}: {supplier.email}
                  </span>
                ) : null}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">{t('Current Balance')}</div>
              {balanceLoading ? (
                <div className="text-2xl font-bold text-gray-400">{t('Loading...')}</div>
              ) : currentBalance !== null ? (
                <div className={`text-3xl font-bold ${getBalanceColor(currentBalance)}`}>
                  Rs{Math.abs(currentBalance).toFixed(2)}
                  {currentBalance > 0 && (
                    <span className="text-sm text-red-600 ml-2">({t('Payable')})</span>
                  )}
                  {currentBalance < 0 && (
                    <span className="text-sm text-green-600 ml-2">({t('Receivable')})</span>
                  )}
                </div>
              ) : (
                <div className="text-2xl font-bold text-gray-600">Rs0.00</div>
              )}
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{t('Statement Period')}</p>
                <Button variant="outline" size="sm" onClick={applyLast30Days}>
                  {t('last_30_days')}
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t('start_date')}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn('w-full justify-start text-left font-normal')}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(new Date(dateRange.startDate), 'PPP')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={new Date(dateRange.startDate)}
                        onSelect={(date) => {
                          if (!date) return;
                          setDateRange((prev) => ({
                            ...prev,
                            startDate: format(date, 'yyyy-MM-dd'),
                          }));
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t('end_date')}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn('w-full justify-start text-left font-normal')}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(new Date(dateRange.endDate), 'PPP')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={new Date(dateRange.endDate)}
                        onSelect={(date) => {
                          if (!date) return;
                          setDateRange((prev) => ({
                            ...prev,
                            endDate: format(date, 'yyyy-MM-dd'),
                          }));
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border px-4 py-3">
              <p className="text-xs text-muted-foreground">{t('Opening Balance')}</p>
              <p className={`mt-1 text-lg font-semibold tabular-nums ${getLedgerBalanceTone('supplier', openingBalance)}`}>
                {formatLedgerBalanceLabel('supplier', openingBalance, t)}
              </p>
            </div>
            <div className="rounded-lg border px-4 py-3">
              <p className="text-xs text-muted-foreground">{t('Debit')}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-red-600">
                Rs{periodSummary.periodDebit.toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg border px-4 py-3">
              <p className="text-xs text-muted-foreground">{t('Credit')}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-green-600">
                Rs{periodSummary.periodCredit.toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg border px-4 py-3">
              <p className="text-xs text-muted-foreground">{t('Closing Balance')}</p>
              <p className={`mt-1 text-lg font-semibold tabular-nums ${getLedgerBalanceTone('supplier', periodSummary.closingBalance)}`}>
                {formatLedgerBalanceLabel('supplier', periodSummary.closingBalance, t)}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-500">{t('Loading...')}</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-gray-500">{t('No transactions found')}</div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">
                  {format(new Date(dateRange.startDate), 'dd MMM yyyy')} — {format(new Date(dateRange.endDate), 'dd MMM yyyy')}
                  {' · '}
                  {totalResults} {t('entries')}
                </span>
                <div className="flex items-center gap-1 rounded-lg border p-1">
                  <Button
                    type="button"
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => handleViewModeChange('list')}
                  >
                    <List className="h-4 w-4" />
                    {t('List View')}
                  </Button>
                  <Button
                    type="button"
                    variant={viewMode === 'category' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => handleViewModeChange('category')}
                  >
                    <LayoutGrid className="h-4 w-4" />
                    {t('Category View')}
                  </Button>
                </div>
              </div>

              {viewMode === 'list' ? (
                renderStatementTable(entries, { showOpeningBalance: true })
              ) : (
                <LedgerCategoryCards
                  groups={categoryGroups}
                  totalActivity={totalCategoryActivity}
                  t={t}
                  onSelectCategory={openCategorySheet}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Sheet open={categorySheetOpen} onOpenChange={setCategorySheetOpen}>
        <SheetContent
          side="right"
          className="w-full max-w-none sm:max-w-[min(96vw,1280px)] p-0 flex flex-col gap-0"
        >
          <SheetHeader className="px-6 pt-6 pb-4 pr-14 border-b flex-shrink-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <SheetTitle className="text-lg">
                  {activeCategoryGroup ? t(activeCategoryGroup.category.labelKey) : ''} — {t('Ledger Details')}
                </SheetTitle>
                {activeCategoryGroup && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>
                      {activeCategoryGroup.entries.length} {t('entries')}
                    </span>
                    {activeCategoryGroup.totalDebit > 0 && (
                      <Badge variant="outline" className="font-normal text-red-700 border-red-200">
                        {t('Debit')}: Rs{activeCategoryGroup.totalDebit.toFixed(2)}
                      </Badge>
                    )}
                    {activeCategoryGroup.totalCredit > 0 && (
                      <Badge variant="outline" className="font-normal text-green-700 border-green-200">
                        {t('Credit')}: Rs{activeCategoryGroup.totalCredit.toFixed(2)}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              {activeCategoryGroup && (
                <div className="flex flex-wrap gap-2 shrink-0">
                  {categoryEntryActions.length > 0 ? (
                    categoryEntryActions.map((action) => (
                      <Button
                        key={action.id}
                        size="sm"
                        className="gap-1.5"
                        onClick={() => handleNavigateEntry(action)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {t(action.labelKey)}
                      </Button>
                    ))
                  ) : (
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() => handleOpenLedgerEntryForm(activeCategoryGroup.category.key)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t('Add Ledger Entry')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-4">
            {activeCategoryGroup && renderStatementTable(activeCategoryGroup.entries)}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
