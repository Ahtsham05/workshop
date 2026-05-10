import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/context/language-context';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/stores/store';
import { AppDispatch } from '@/stores/store';
import { useGetBranchQuery } from '@/stores/branch.api';
import { useGetMyOrganizationQuery } from '@/stores/organization.api';
import { ArrowLeft, Plus, Edit, Trash2, Download, Receipt, Printer } from 'lucide-react';
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

function isLoadPurchaseLedgerRow(entry: LedgerEntry): boolean {
  const ref = String(entry.reference || '').toUpperCase();
  if (ref.includes('LOAD-PURCHASE')) return true;
  return /\bload purchase\b/i.test(entry.description || '');
}

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
              <TableHead>{t('Quantity')}</TableHead>
              <TableHead>{t('price')}</TableHead>
              <TableHead className="text-right">{t('Total')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchaseData.items && purchaseData.items.length > 0 ? (
              purchaseData.items.map((item: any, index: number) => (
                <TableRow key={index}>
                  <TableCell>{item.name || item.product?.name || item.productName || '-'}</TableCell>
                  <TableCell>{item.quantity || 0}</TableCell>
                  <TableCell>Rs{formatCurrency(item.unitPrice || item.price)}</TableCell>
                  <TableCell className="text-right">Rs{formatCurrency(item.subtotal || item.total)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-gray-500">{t('No items')}</TableCell>
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

export function SupplierLedgerDetails({ supplier, onBack }: SupplierLedgerDetailsProps) {
  const { t } = useLanguage();
  const dispatch = useDispatch<AppDispatch>();
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId);
  const preferredLanguage = useSelector((state: RootState) => state.auth.data?.user?.preferredLanguage || 'en');
  const user = useSelector((state: RootState) => state.auth.data?.user);
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId });
  const { data: orgData } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId });
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
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [printingRowId, setPrintingRowId] = useState<string | null>(null);

  useEffect(() => {
    fetchLedgerEntries();
    fetchSupplierBalance();
  }, [supplier._id, currentPage, pageSize]);

  const fetchLedgerEntries = async () => {
    try {
      setLoading(true);
      const response = await Axios.get(summery.fetchSupplierLedgerEntries.url, {
        params: {
          supplier: supplier._id,
          sortBy: 'transactionDate:asc',
          page: currentPage,
          limit: pageSize
        },
      });
      setEntries(response.data.results || []);
      setTotalPages(response.data.totalPages || 1);
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
    // Find the previous balance from the entry before this one
    const entryIndex = entries.findIndex(e => (e.id || e._id) === (entry.id || entry._id));
    const previousBalance = entryIndex > 0 ? entries[entryIndex - 1].balance : entry.balance - entry.debit + entry.credit;

    setSelectedPayment({
      entry,
      previousBalance,
      currentBalance: entry.balance,
    });
    setReceiptDialogOpen(true);
  };

  const isManualEntry = (entry: LedgerEntry) => {
    const rid = entry.referenceId as unknown;
    if (rid == null) return true;
    if (typeof rid === 'string' && !rid.trim()) return true;
    return false;
  };

  const canPrintLinkedSupplierEntry = (entry: LedgerEntry) =>
    Boolean(entry.referenceId) &&
    !isManualEntry(entry) &&
    (entry.transactionType === 'purchase' ||
      entry.transactionType === 'payment_made' ||
      entry.transactionType === 'purchase_return');

  const handlePrintLinkedPurchase = async (entry: LedgerEntry) => {
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
      const html = printModule.generatePurchaseInvoiceHTML(
        purchase,
        purchase?.supplier?.name || supplier.name,
        t,
        branchDetails,
        preferredLanguage,
        getInvoicePrintInUrdu(),
      );
      const w = window.open('', '_blank');
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between sm:flex-row flex-col gap-4 sm:gap-0">
        <div className='flex justify-between gap-4'>
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('Back to Suppliers')}
          </Button>
          <div className="flex items-center gap-2">
            <Label className="text-sm">{t('Show')}</Label>
            <Select value={pageSize.toString()} onValueChange={(value) => { setPageSize(Number(value)); setCurrentPage(1); }}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
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
              ledgerType="supplier"
              entityId={supplier._id}
              entityName={supplier.name}
              editingEntry={editingEntry}
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
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>{supplier.name}</CardTitle>
          <CardDescription>
            <span className='block'>{t('Transaction History and Balance')}</span>
            {(supplier.phone || supplier.email) && (
              <span className='mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground'>
                {supplier.phone ? (
                  <span>
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
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
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

          {loading ? (
            <div className="text-center py-8 text-gray-500">{t('Loading...')}</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-gray-500">{t('No transactions found')}</div>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Date')}</TableHead>
                    <TableHead>{t('Type')}</TableHead>
                    <TableHead>{t('Description')}</TableHead>
                    <TableHead>{t('Reference')}</TableHead>
                    <TableHead>{t('Invoice Type')}</TableHead>
                    <TableHead className="text-right">{t('Debit')}</TableHead>
                    <TableHead className="text-right">{t('Credit')}</TableHead>
                    <TableHead className="text-right">{t('Balance')}</TableHead>
                    <TableHead className="text-right whitespace-nowrap w-[1%]">{t('Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id || entry._id}>
                      <TableCell className="text-sm">
                        {format(new Date(entry.transactionDate), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getTransactionTypeBadge(entry.transactionType)}>
                          {getTransactionTypeLabel(entry)}
                        </Badge>
                      </TableCell>
                      <TableCell>{entry.description}</TableCell>
                      <TableCell className="text-gray-500 text-sm">
                        {entry.referenceId ? (
                          <Button
                            variant="link"
                            className="p-0 h-auto font-normal text-blue-600 hover:text-blue-800"
                            onClick={() => handleViewLinkedSupplierEntry(entry)}
                          >
                            {entry.reference || entry.referenceId}
                          </Button>
                        ) : (
                          entry.reference || '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-800">{formatLedgerInvoiceType(entry, t)}</span>
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        {entry.debit > 0 ? `Rs${entry.debit.toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        {entry.credit > 0 ? `Rs${entry.credit.toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell className={`text-right ${getBalanceColor(entry.balance)}`}>
                        Rs{Math.abs(entry.balance).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap align-middle">
                        <div className="flex justify-end gap-1 flex-nowrap items-center shrink-0">
                          {canPrintLinkedSupplierEntry(entry) && (
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-gray-600">
                {t('Showing')} {(currentPage - 1) * pageSize + 1} {t('to')} {Math.min(currentPage * pageSize, totalResults)} {t('of')} {totalResults} {t('entries')}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
                  {t('First')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1}>
                  {t('Previous')}
                </Button>
                <div className="flex items-center gap-2 px-3">
                  <span className="text-sm text-gray-600">
                    {t('Page')} {currentPage} {t('of')} {totalPages}
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages}>
                  {t('Next')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>
                  {t('Last')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
