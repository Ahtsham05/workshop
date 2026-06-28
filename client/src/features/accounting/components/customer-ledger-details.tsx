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
import { expiryBadge } from '@/features/reports/utils/expiry-badge';
import { useNavigate } from '@tanstack/react-router';
import * as XLSX from 'xlsx';
import Axios from '@/utils/Axios';
import summery from '@/utils/summery';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { LedgerEntryForm } from './ledger-entry-form';
import { invoiceApi, useGetInvoiceByIdQuery } from '@/stores/invoice.api';
import { returnsApi, useGetSalesReturnByIdQuery } from '@/stores/returns.api';
import { PaymentReceipt } from './payment-receipt';
import {
  mobileShopApi,
  useGetCashWithdrawalByIdQuery,
  useGetLoadTransactionByIdQuery,
  useGetSimSaleByIdQuery,
} from '@/stores/mobile-shop.api';
import {
  generateInvoiceHTML,
  generateA4InvoiceHTML,
  openPrintWindow,
  openA4PrintWindow,
} from '@/features/invoice/utils/print-utils';
import { balanceBeforeFromLedgerEntry } from '@/features/invoice/utils/invoice-print-balance';
import { LedgerStatementTable } from './ledger-statement-table';
import { LedgerCategoryCards, type LedgerCategoryGroup } from './ledger-category-cards';
import { LEDGER_STATEMENT_SORT, formatLedgerBalanceLabel, getLedgerBalanceTone } from '@/features/accounting/utils/ledger-display';
import {
  isManualLedgerEntry,
  isSimSaleLedgerRow,
  isLoadSaleLedgerRow,
  isCashWithdrawalLedgerRow,
  groupCustomerLedgerEntries,
} from '@/features/accounting/utils/customer-ledger-categories';
import {
  getCustomerLedgerEntryActions,
  getLedgerFormPreset,
} from '@/features/accounting/utils/customer-ledger-entry-navigation';
import { cn } from '@/lib/utils';
import { withCustomerContactForPrint } from '@/features/invoice/utils/invoice-print-whatsapp';
import { WhatsAppSendButton } from '@/components/whatsapp/whatsapp-send-button';
import {
  fetchAndStashPrintContact,
  resolveCustomerIdString,
  stashPrintContact,
  type PrintWindowContact,
} from '@/features/invoice/utils/invoice-print-contact-bridge';
import { getInvoicePrintInUrdu } from '@/features/invoice/utils/print-preferences';
import { printMobileShopReceipt } from '@/features/mobile-shop/utils/mobile-shop-print-utils';

interface LedgerEntry {
  _id?: string;
  id?: string;  // Backend returns 'id' not '_id'
  transactionType: string;
  transactionDate: string;
  description: string;
  reference?: string;
  referenceId?: string;  // Links to invoice if auto-generated
  debit: number;
  credit: number;
  balance: number;
  paymentMethod?: string;
  /** Sale terms from invoice: cash / credit / pending (not payment rail). */
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

function resolveInvoiceCustomerForPrint(invoice: any, fallbackName: string): { name: string; nameUrdu?: string } {
  if (invoice.customerId === 'walk-in') {
    return { name: invoice.walkInCustomerName || 'Walk-in', nameUrdu: undefined };
  }
  const cid = invoice.customerId;
  if (cid && typeof cid === 'object') {
    return {
      name: cid.name || invoice.customerName || fallbackName,
      nameUrdu: cid.nameUrdu?.trim() || undefined,
    };
  }
  return { name: invoice.customerName || fallbackName, nameUrdu: undefined };
}

interface CustomerLedgerDetailsProps {
  customer: any;
  onBack: () => void;
  initialLedgerEntry?: string;
}

// Invoice dialog content component
function InvoiceDialogContent({ invoiceId, customerName }: { invoiceId?: string; customerName: string }) {
  const { t } = useLanguage();

  if (!invoiceId) {
    return <div className="text-center py-8 text-gray-500">{t('No invoice selected')}</div>;
  }

  const { data: invoiceData, isLoading, error } = useGetInvoiceByIdQuery(invoiceId);

  if (isLoading) {
    return <div className="text-center py-8 text-gray-500">{t('Loading...')}</div>;
  }

  if (error || !invoiceData) {
    return <div className="text-center py-8 text-red-500">{t('Failed to load invoice details')}</div>;
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
          <p className="font-medium">{invoiceData.invoiceNumber || '-'}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">{t('Date')}</p>
          <p className="font-medium">{formatDate(invoiceData.invoiceDate || invoiceData.date)}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">{t('Customer')}</p>
          <p className="font-medium">{invoiceData.customer?.name || customerName}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">{t('Total Amount')}</p>
          <p className="font-medium text-lg">Rs{formatCurrency(invoiceData.total || invoiceData.totalAmount)}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">{t('Status')}</p>
          <Badge>{invoiceData.status || 'N/A'}</Badge>
        </div>
        <div>
          <p className="text-sm text-gray-500">{t('Type')}</p>
          <Badge variant="outline">{invoiceData.type || 'N/A'}</Badge>
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
            {invoiceData.items && invoiceData.items.length > 0 ? (
              invoiceData.items.map((item: any, index: number) => {
                const variantLabel = item.variantId?.attributes
                  ? Object.values(item.variantId.attributes).join(' / ')
                  : ''
                return (
                <TableRow key={index}>
                  <TableCell>{item.name || item.product?.name || item.productName || '-'}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{variantLabel || '—'}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{item.batchNumber || '—'}</TableCell>
                  <TableCell>{expiryBadge(item.batchId?.expiryDate)}</TableCell>
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

function SalesReturnDialogContent({
  salesReturnId,
  fallbackCustomerName,
}: {
  salesReturnId?: string;
  fallbackCustomerName: string;
}) {
  const { t } = useLanguage();

  if (!salesReturnId) {
    return <div className="text-center py-8 text-gray-500">{t('No transaction selected')}</div>;
  }

  const { data: sr, isLoading, error } = useGetSalesReturnByIdQuery(salesReturnId);

  if (isLoading) {
    return <div className="text-center py-8 text-gray-500">{t('Loading...')}</div>;
  }

  if (error || !sr) {
    return <div className="text-center py-8 text-red-500">{t('Failed to load sales return details')}</div>;
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

  const customerLabel =
    sr.customerName ||
    (typeof sr.customerId === 'object' && sr.customerId != null && 'name' in sr.customerId
      ? String((sr.customerId as { name?: string }).name || '')
      : '') ||
    fallbackCustomerName;

  const invoiceLabel =
    typeof sr.invoiceId === 'object' && sr.invoiceId != null && 'invoiceNumber' in sr.invoiceId
      ? String((sr.invoiceId as { invoiceNumber?: string }).invoiceNumber || '')
      : typeof sr.invoiceId === 'string'
        ? sr.invoiceId
        : '';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-gray-500">{t('Return Number')}</p>
          <p className="font-medium">{sr.returnNumber || '-'}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">{t('Date')}</p>
          <p className="font-medium">{formatDate(sr.date || sr.createdAt)}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">{t('Customer')}</p>
          <p className="font-medium">{customerLabel}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">{t('Total Amount')}</p>
          <p className="font-medium text-lg">Rs{formatCurrency(sr.totalAmount)}</p>
        </div>
        {invoiceLabel ? (
          <div>
            <p className="text-sm text-gray-500">{t('Invoice Number')}</p>
            <p className="font-medium">{invoiceLabel}</p>
          </div>
        ) : null}
        <div>
          <p className="text-sm text-gray-500">{t('Refund method')}</p>
          <Badge variant="outline">{sr.refundMethod || '—'}</Badge>
        </div>
        <div>
          <p className="text-sm text-gray-500">{t('Status')}</p>
          <Badge>{sr.status || 'N/A'}</Badge>
        </div>
        {sr.reason?.trim() ? (
          <div className="col-span-2">
            <p className="text-sm text-gray-500">{t('Reason')}</p>
            <p className="font-medium">{sr.reason}</p>
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
            {sr.items && sr.items.length > 0 ? (
              sr.items.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>{item.name || '-'}</TableCell>
                  <TableCell>{item.quantity ?? 0}</TableCell>
                  <TableCell>Rs{formatCurrency(item.price)}</TableCell>
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

function SimSaleDetailDialogContent({
  simSaleId,
  fallbackCustomerName,
}: {
  simSaleId?: string;
  fallbackCustomerName: string;
}) {
  const { t } = useLanguage();

  if (!simSaleId) {
    return <div className="text-center py-8 text-gray-500">{t('No transaction selected')}</div>;
  }

  const { data: sale, isLoading, error } = useGetSimSaleByIdQuery(simSaleId);

  if (isLoading) {
    return <div className="text-center py-8 text-gray-500">{t('Loading...')}</div>;
  }

  if (error || !sale) {
    return (
      <div className="text-center py-8 text-red-500">{t('Failed to load SIM sale details')}</div>
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

  const cust =
    sale.customerName?.trim() ||
    (typeof sale.customerId === 'object' && sale.customerId != null && 'name' in sale.customerId
      ? String((sale.customerId as { name?: string }).name || '')
      : '') ||
    fallbackCustomerName;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('SIM sale')}</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">{t('Job number')}</p>
            <p className="font-semibold text-slate-900 dark:text-slate-100">#{sale.jobNumber}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('Date')}</p>
            <p className="font-medium">{fmtDate(sale.date)}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">{t('Product')}</p>
            <p className="font-medium">{sale.productName?.trim() || '—'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <p className="text-xs text-muted-foreground">{t('Customer')}</p>
          <p className="font-medium">{cust}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('phone')}</p>
          <p className="font-medium">{sale.customerMobile?.trim() || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">CNIC</p>
          <p className="font-medium">{sale.customerCNIC?.trim() || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('Location')}</p>
          <p className="font-medium">{sale.customerLocation?.trim() || '—'}</p>
        </div>
        <div className="col-span-2">
          <p className="text-xs text-muted-foreground">{t('Load A/C')}</p>
          <p className="font-medium">{sale.walletType?.trim() || '—'}</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('Amounts')}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">{t('SIM amount')}</p>
            <p className="font-medium">Rs{fmt(sale.simAmount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('Load amount')}</p>
            <p className="font-medium">Rs{fmt(sale.loadAmount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('Purchase amount')}</p>
            <p className="font-medium">Rs{fmt(sale.purchaseAmount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('Commission')}</p>
            <p className="font-medium">Rs{fmt(sale.commission)}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">{t('Total amount')}</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">Rs{fmt(sale.saleAmount)}</p>
          </div>
        </div>
      </div>

      {sale.notes?.trim() ? (
        <div>
          <p className="text-xs text-muted-foreground">{t('Notes')}</p>
          <p className="mt-1 rounded-md bg-muted/60 p-3 text-sm">{sale.notes}</p>
        </div>
      ) : null}
    </div>
  );
}

function LoadSaleDetailDialogContent({
  transactionId,
  fallbackCustomerName,
}: {
  transactionId?: string;
  fallbackCustomerName: string;
}) {
  const { t } = useLanguage();

  if (!transactionId) {
    return <div className="text-center py-8 text-gray-500">{t('No transaction selected')}</div>;
  }

  const { data: tx, isLoading, error } = useGetLoadTransactionByIdQuery(transactionId);

  if (isLoading) {
    return <div className="text-center py-8 text-gray-500">{t('Loading...')}</div>;
  }

  if (error || !tx) {
    return (
      <div className="text-center py-8 text-red-500">{t('Failed to load load sale details')}</div>
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

  const cust =
    tx.customerName?.trim() ||
    (typeof tx.customerId === 'object' && tx.customerId != null && 'name' in tx.customerId
      ? String((tx.customerId as { name?: string }).name || '')
      : '') ||
    fallbackCustomerName;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('Load sale')}</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">{t('Transaction ID')}</p>
            <p className="font-mono text-sm font-medium">{String(tx.id).slice(-12)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('Date')}</p>
            <p className="font-medium">{fmtDate(tx.date)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('Type')}</p>
            <Badge variant="outline">{tx.type}</Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('Network')}</p>
            <p className="font-medium">{tx.network}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <p className="text-xs text-muted-foreground">{t('Wallet')}</p>
          <p className="font-medium">{tx.walletType}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('phone')}</p>
          <p className="font-medium">{tx.mobileNumber}</p>
        </div>
        <div className="col-span-2">
          <p className="text-xs text-muted-foreground">{t('Customer')}</p>
          <p className="font-medium">{cust}</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('Amounts')}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">{t('Amount')}</p>
            <p className="font-medium">Rs{fmt(tx.amount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('Received')}</p>
            <p className="font-medium">Rs{fmt(tx.receivedAmount ?? 0)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('Commission rate')}</p>
            <p className="font-medium">{fmt(tx.commissionRate)}%</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('Extra charge')}</p>
            <p className="font-medium">Rs{fmt(tx.extraCharge)}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">{t('Profit')}</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">Rs{fmt(tx.profit)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CashWithdrawalDetailDialogContent({
  withdrawalId,
  fallbackCustomerName,
}: {
  withdrawalId?: string;
  fallbackCustomerName: string;
}) {
  const { t } = useLanguage();

  if (!withdrawalId) {
    return <div className="text-center py-8 text-gray-500">{t('No transaction selected')}</div>;
  }

  const { data: cw, isLoading, error } = useGetCashWithdrawalByIdQuery(withdrawalId);

  if (isLoading) {
    return <div className="text-center py-8 text-gray-500">{t('Loading...')}</div>;
  }

  if (error || !cw) {
    return (
      <div className="text-center py-8 text-red-500">{t('Failed to load cash transaction details')}</div>
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

  const cust =
    (typeof cw.customerId === 'object' && cw.customerId != null && 'name' in cw.customerId
      ? String((cw.customerId as { name?: string }).name || '')
      : '') ||
    cw.customerName?.trim() ||
    fallbackCustomerName;

  const typeLabel =
    cw.transactionType === 'withdrawal' ? t('Received') : t('Send');

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('Cash Management')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge>{typeLabel}</Badge>
          <span className="text-xs text-muted-foreground">{fmtDate(cw.date)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <p className="text-xs text-muted-foreground">{t('Wallet')}</p>
          <p className="font-medium">{cw.walletType}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('Customer')}</p>
          <p className="font-medium">{cust}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('Customer account')}</p>
          <p className="font-medium">{cw.customerNumber?.trim() || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('Account type')}</p>
          <p className="font-medium">{cw.customerAccountType || '—'}</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('Amounts')}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">{t('Wallet amount')}</p>
            <p className="font-medium">Rs{fmt(cw.amount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('Cash amount')}</p>
            <p className="font-medium">Rs{fmt(cw.cashAmount ?? 0)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('Commission rate')}</p>
            <p className="font-medium">{fmt(cw.commissionRate)}%</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('Extra charge')}</p>
            <p className="font-medium">Rs{fmt(cw.extraCharge)}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">{t('Profit')}</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">Rs{fmt(cw.profit)}</p>
          </div>
        </div>
      </div>

      {cw.notes?.trim() ? (
        <div>
          <p className="text-xs text-muted-foreground">{t('Notes')}</p>
          <p className="mt-1 rounded-md bg-muted/60 p-3 text-sm">{cw.notes}</p>
        </div>
      ) : null}
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

const CUSTOMER_LEDGER_VIEW_MODE_KEY = 'customer-ledger-view-mode';

type LedgerViewMode = 'list' | 'category';

function getStoredLedgerViewMode(): LedgerViewMode {
  try {
    const stored = localStorage.getItem(CUSTOMER_LEDGER_VIEW_MODE_KEY);
    if (stored === 'list' || stored === 'category') return stored;
  } catch {
    /* ignore */
  }
  return 'list';
}

function storeLedgerViewMode(mode: LedgerViewMode) {
  try {
    localStorage.setItem(CUSTOMER_LEDGER_VIEW_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function CustomerLedgerDetails({ customer, onBack, initialLedgerEntry }: CustomerLedgerDetailsProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();
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
  const [viewingInvoice, setViewingInvoice] = useState<any>(null);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [viewingSalesReturnId, setViewingSalesReturnId] = useState<string | null>(null);
  const [salesReturnDialogOpen, setSalesReturnDialogOpen] = useState(false);
  const [viewingSimSaleId, setViewingSimSaleId] = useState<string | null>(null);
  const [simSaleDialogOpen, setSimSaleDialogOpen] = useState(false);
  const [viewingLoadTxId, setViewingLoadTxId] = useState<string | null>(null);
  const [loadSaleDialogOpen, setLoadSaleDialogOpen] = useState(false);
  const [viewingCashWithdrawalId, setViewingCashWithdrawalId] = useState<string | null>(null);
  const [cashWithdrawalDialogOpen, setCashWithdrawalDialogOpen] = useState(false);
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
    fetchCustomerBalance();
  }, [customer._id, dateRange.startDate, dateRange.endDate]);

  const fetchLedgerEntries = async () => {
    try {
      setLoading(true);
      const response = await Axios.get(summery.fetchCustomerLedgerEntries.url, {
        params: {
          customer: customer._id,
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
      XLSX.writeFile(wb, `${customer.name}-ledger-${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success(t('Data exported successfully'));
    } catch (error) {
      console.error('Export error:', error);
      toast.error(t('Failed to export data'));
    }
  };

  const fetchCustomerBalance = async () => {
    try {
      setBalanceLoading(true);
      const url = `${summery.fetchCustomerBalance.url}/${customer._id}${summery.fetchCustomerBalance.urlSuffix || ''}`;
      const response = await Axios.get(url);
      setCurrentBalance(response.data.balance || 0);
    } catch (error: any) {
      console.error('Failed to fetch customer balance:', error);
      setCurrentBalance(customer.balance || 0);
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
      await Axios.delete(`${summery.deleteCustomerLedgerEntry.url}/${entryId}`);
      dispatch(mobileShopApi.util.invalidateTags(['Wallets', 'MobileDashboard']));
      toast.success(t('Ledger entry deleted successfully'));
      fetchLedgerEntries();
      fetchCustomerBalance();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('Failed to delete ledger entry'));
      console.error('Error deleting ledger entry:', error);
    }
  };

  const handleViewLinkedCustomerEntry = (entry: LedgerEntry) => {
    const id = entry.referenceId != null ? String(entry.referenceId) : '';
    if (!id) return;
    if (entry.transactionType === 'sales_return') {
      setViewingSalesReturnId(id);
      setSalesReturnDialogOpen(true);
      return;
    }
    if (isCashWithdrawalLedgerRow(entry)) {
      setViewingCashWithdrawalId(id);
      setCashWithdrawalDialogOpen(true);
      return;
    }
    if (entry.transactionType === 'sale') {
      if (isSimSaleLedgerRow(entry)) {
        setViewingSimSaleId(id);
        setSimSaleDialogOpen(true);
        return;
      }
      if (isLoadSaleLedgerRow(entry)) {
        setViewingLoadTxId(id);
        setLoadSaleDialogOpen(true);
        return;
      }
    }
    setViewingInvoice({ id });
    setInvoiceDialogOpen(true);
  };

  const handleGenerateReceipt = (entry: LedgerEntry) => {
    // Find the previous balance from the entry before this one
    const entryIndex = entries.findIndex(e => (e.id || e._id) === (entry.id || entry._id));
    const previousBalance = entryIndex > 0 ? entries[entryIndex - 1].balance : entry.balance - entry.credit + entry.debit;

    setSelectedPayment({
      entry,
      previousBalance,
      currentBalance: entry.balance,
    });
    setReceiptDialogOpen(true);
  };

  /** True when this line was added via Accounts → Add Entry (no linked sales invoice / SIM sale / etc.). */
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

  const categoryGroups = useMemo(() => groupCustomerLedgerEntries(entries), [entries]);

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
        ? getCustomerLedgerEntryActions(activeCategoryGroup.category, customer._id)
        : [],
    [activeCategoryGroup, customer._id],
  );

  const handleNavigateEntry = (action: ReturnType<typeof getCustomerLedgerEntryActions>[number]) => {
    setCategorySheetOpen(false);
    navigate({ to: action.to, search: action.search as any });
  };

  const handleOpenLedgerEntryForm = (categoryKey: string) => {
    const preset = getLedgerFormPreset(categoryKey);
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

  const renderLedgerActions = (entry: LedgerEntry) => (
    <div className="flex justify-end gap-1 flex-nowrap items-center shrink-0">
      {canPrintLinkedCustomerEntry(entry) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handlePrintLinkedCustomerDoc(entry, 'receipt')}
          disabled={printingRowId === String(entry.id || entry._id)}
          className="h-8 w-8 p-0"
          title={t('print_invoice_btn')}
        >
          <Printer className="w-4 h-4 text-slate-700" />
        </Button>
      )}
      {usesInvoiceA4Print(entry) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handlePrintLinkedCustomerDoc(entry, 'a4')}
          disabled={printingRowId === String(entry.id || entry._id)}
          className="h-8 w-8 p-0"
          title={t('print_a4') || 'Print A4 invoice'}
        >
          <Receipt className="w-4 h-4 text-slate-700" />
        </Button>
      )}
      {entry.transactionType === 'payment_received' && entry.credit > 0 && (
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
          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
          title={t('Delete entry')}
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
        onClick={() => handleViewLinkedCustomerEntry(entry)}
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
      party="customer"
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

  const canPrintLinkedCustomerEntry = (entry: LedgerEntry) =>
    Boolean(entry.referenceId) &&
    !isManualEntry(entry) &&
    (entry.transactionType === 'sale' ||
      entry.transactionType === 'payment_received' ||
      entry.transactionType === 'sales_return');

  const usesInvoiceA4Print = (entry: LedgerEntry) =>
    canPrintLinkedCustomerEntry(entry) &&
    entry.transactionType !== 'sales_return' &&
    !isSimSaleLedgerRow(entry) &&
    !isLoadSaleLedgerRow(entry);

  const handlePrintLinkedCustomerDoc = async (
    entry: LedgerEntry,
    format: 'receipt' | 'a4' = 'receipt',
  ) => {
    const rid = entry.referenceId ? String(entry.referenceId) : '';
    const rowId = String(entry.id || entry._id || '');
    if (!rid || !rowId) return;
    setPrintingRowId(rowId);
    try {
      if (entry.transactionType === 'sales_return') {
        const sr = await dispatch(returnsApi.endpoints.getSalesReturnById.initiate(rid)).unwrap();
        const fmtRs = (n: number) => `Rs${Number(n ?? 0).toFixed(2)}`;
        const cust =
          sr.customerName ||
          (typeof sr.customerId === 'object' && sr.customerId != null && 'name' in sr.customerId
            ? String((sr.customerId as { name?: string }).name || '')
            : '') ||
          customer.name ||
          '—';
        const invRef =
          typeof sr.invoiceId === 'object' && sr.invoiceId != null && 'invoiceNumber' in sr.invoiceId
            ? String((sr.invoiceId as { invoiceNumber?: string }).invoiceNumber || '')
            : typeof sr.invoiceId === 'string'
              ? sr.invoiceId
              : '';
        const itemLines =
          sr.items?.map((it) => ({
            label: `${it.name} × ${it.quantity}`,
            value: fmtRs(it.total),
          })) ?? [];
        printMobileShopReceipt(
          {
            title: 'Sales return',
            reference: sr.returnNumber,
            issuedAt: sr.date ? new Date(sr.date).toLocaleString() : new Date(sr.createdAt).toLocaleString(),
            lines: [
              { label: 'Customer', value: cust },
              ...(invRef ? [{ label: 'Invoice', value: invRef }] : []),
              ...itemLines,
              { label: 'Total', value: fmtRs(sr.totalAmount) },
              ...(sr.reason?.trim() ? [{ label: 'Reason', value: sr.reason }] : []),
            ],
          },
          orgData,
          branchData?.invoiceNote ?? undefined,
        );
        toast.success(t('print_invoice_btn'));
        return;
      }

      if (isSimSaleLedgerRow(entry)) {
        const sale = await dispatch(mobileShopApi.endpoints.getSimSaleById.initiate(rid)).unwrap();
        const fmtRs = (n: number) => `Rs${Number(n ?? 0).toFixed(2)}`;
        printMobileShopReceipt(
          {
            title: 'SIM sale',
            reference: `Job #${sale.jobNumber}`,
            issuedAt: new Date(sale.date).toLocaleString(),
            lines: [
              { label: 'Item', value: sale.productName || '—' },
              { label: 'Load A/C', value: sale.walletType || '—' },
              { label: 'Customer', value: sale.customerName || customer.name || '—' },
              { label: 'Mobile', value: sale.customerMobile || '—' },
              { label: 'CNIC', value: sale.customerCNIC?.trim() || '—' },
              { label: 'Location', value: sale.customerLocation?.trim() || '—' },
              { label: 'SIM amount', value: fmtRs(sale.simAmount) },
              { label: 'Load amount', value: fmtRs(sale.loadAmount) },
              { label: 'Commission', value: fmtRs(sale.commission) },
              { label: 'Total amount', value: fmtRs(sale.saleAmount) },
            ],
          },
          orgData,
          branchData?.invoiceNote ?? undefined,
        );
        toast.success(t('print_invoice_btn'));
        return;
      }

      if (isLoadSaleLedgerRow(entry)) {
        const tx = await dispatch(mobileShopApi.endpoints.getLoadTransactionById.initiate(rid)).unwrap();
        const fmtRs = (n: number) => `Rs${Number(n ?? 0).toFixed(2)}`;
        const cust =
          tx.customerName ||
          (typeof tx.customerId === 'object' && tx.customerId && 'name' in (tx.customerId as object)
            ? String((tx.customerId as { name?: string }).name || '')
            : '') ||
          customer.name ||
          '—';
        printMobileShopReceipt(
          {
            title: 'Load sale',
            reference: String(tx.id).slice(-10).toUpperCase(),
            issuedAt: new Date(tx.date).toLocaleString(),
            lines: [
              { label: 'Network', value: tx.network || '—' },
              { label: 'Wallet', value: tx.walletType },
              { label: 'Customer', value: cust || '—' },
              { label: 'Mobile', value: tx.mobileNumber || '—' },
              { label: 'Amount', value: fmtRs(tx.amount) },
              { label: 'Received', value: fmtRs(tx.receivedAmount ?? 0) },
              { label: 'Commission %', value: `${Number(tx.commissionRate ?? 0).toFixed(2)}%` },
              { label: 'Extra charge', value: fmtRs(tx.extraCharge) },
              { label: 'Profit', value: fmtRs(tx.profit) },
            ],
          },
          orgData,
          branchData?.invoiceNote ?? undefined,
        );
        toast.success(t('print_invoice_btn'));
        return;
      }

      const invoice = await dispatch(invoiceApi.endpoints.getInvoiceById.initiate(rid)).unwrap();
      const { name: customerName, nameUrdu: customerNameUrdu } = resolveInvoiceCustomerForPrint(invoice, customer.name);
      const previousBalance = balanceBeforeFromLedgerEntry(entry);

      const customerIdStr =
        resolveCustomerIdString(invoice.customerId) || String(customer._id || customer.id || '')
      let contactPhone = customer.phone?.trim()
      let contactWhatsapp = customer.whatsapp?.trim()
      stashPrintContact({
        customerId: customerIdStr,
        phone: contactPhone,
        whatsapp: contactWhatsapp,
      })
      try {
        const fetched = await fetchAndStashPrintContact(customerIdStr)
        contactPhone = fetched.phone || contactPhone
        contactWhatsapp = fetched.whatsapp || contactWhatsapp
      } catch {
        /* use cached / prompt in print window */
      }

      const printContact: PrintWindowContact = {
        customerId: customerIdStr,
        phone: contactPhone,
        whatsapp: contactWhatsapp || contactPhone,
      }

      const printData = withCustomerContactForPrint({
        invoiceNumber: invoice.invoiceNumber,
        items: (invoice.items || []).map((item: any) => ({
          name: item.name,
          nameUrdu: item.nameUrdu || (typeof item.productId === 'object' ? item.productId?.nameUrdu : undefined),
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal ?? (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
        })),
        customerId: invoice.customerId,
        customerName,
        customerNameUrdu,
        walkInCustomerName: invoice.walkInCustomerName,
        type: invoice.type,
        subtotal: invoice.subtotal ?? 0,
        tax: invoice.tax ?? 0,
        discount: invoice.discount ?? 0,
        total: invoice.total ?? 0,
        paidAmount: invoice.paidAmount ?? 0,
        balance: invoice.balance ?? 0,
        notes: invoice.notes,
        invoiceAddress: branchData?.location?.address?.trim() || undefined,
        invoiceAddressUrdu: branchData?.location?.addressUrdu?.trim() || undefined,
        deliveryCharge: invoice.deliveryCharge ?? 0,
        serviceCharge: invoice.serviceCharge ?? 0,
        companyName: orgData?.name || branchData?.name,
        companyNameUrdu: branchData?.nameUrdu?.trim() || orgData?.nameUrdu?.trim() || undefined,
        companyAddress: [branchData?.location?.address, branchData?.location?.city, branchData?.location?.country].filter(Boolean).join(', ') || undefined,
        companyPhone: branchData?.phone,
        companyEmail: branchData?.email,
        companyLogo: orgData?.logo?.url,
        isTrial: orgData?.subscription?.isTrial,
        language: invoice.language,
        isUrduOnly: invoice.isUrduOnly,
        userPreferredLanguage: preferredLanguage as 'en' | 'ur',
        invoiceNote: branchData?.invoiceNote,
        printInUrdu: getInvoicePrintInUrdu(),
        previousBalance,
        newBalance: entry.balance,
      }, invoice, { phone: contactPhone, whatsapp: contactWhatsapp || contactPhone });

      if (format === 'a4') {
        openA4PrintWindow(generateA4InvoiceHTML(printData), printContact);
      } else {
        openPrintWindow(generateInvoiceHTML(printData), printContact);
      }
      toast.success(t('print_invoice_btn'));
    } catch (error) {
      console.error(error);
      toast.error(t('print_error'));
    } finally {
      setPrintingRowId(null);
    }
  };

  const getTransactionTypeLabel = (entry: LedgerEntry) => {
    const type = entry.transactionType;
    const manual = isManualEntry(entry);

    if (type === 'sale') {
      return manual ? t('Cash Paid') : t('Sale');
    }
    if (type === 'payment_received') {
      return manual ? t('Cash Received') : t('Payment Received');
    }

    const labels: Record<string, string> = {
      refund: t('Refund'),
      sales_return: t('Sales Return'),
      credit_note: t('Credit Note'),
      debit_note: t('Debit Note'),
      adjustment: t('Adjustment'),
      opening_balance: t('Opening Balance'),
    };
    return labels[type] || type;
  };

  const getTransactionTypeBadge = (type: string) => {
    const variants: Record<string, any> = {
      sale: 'default',
      payment_received: 'default',
      sales_return: 'destructive',
      credit_note: 'secondary',
      debit_note: 'secondary',
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
      <div className="flex items-center justify-end sm:justify-between sm:flex-row flex-col gap-4">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('Back to Customers')}
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
              ledgerType="customer"
              entityId={customer._id}
              entityName={customer.name}
              editingEntry={editingEntry}
              defaultTransactionType={ledgerFormPreset?.transactionType}
              defaultPaymentMethod={ledgerFormPreset?.paymentMethod}
              onSuccess={(createdEntry) => {
                handleCloseForm();
                fetchLedgerEntries();
                fetchCustomerBalance();

                // Auto-generate receipt for payment received
                if (createdEntry && createdEntry.transactionType === 'payment_received') {
                  setTimeout(() => {
                    const previousBalance = currentBalance || 0;
                    const newBalance = previousBalance - createdEntry.credit;

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

      <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('Invoice Details')}</DialogTitle>
          </DialogHeader>
          <InvoiceDialogContent invoiceId={viewingInvoice?.id} customerName={customer.name} />
        </DialogContent>
      </Dialog>

      <Dialog
        open={salesReturnDialogOpen}
        onOpenChange={(open) => {
          setSalesReturnDialogOpen(open);
          if (!open) setViewingSalesReturnId(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('Sales Return')}</DialogTitle>
          </DialogHeader>
          <SalesReturnDialogContent
            salesReturnId={viewingSalesReturnId ?? undefined}
            fallbackCustomerName={customer.name}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={simSaleDialogOpen}
        onOpenChange={(open) => {
          setSimSaleDialogOpen(open);
          if (!open) setViewingSimSaleId(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('SIM sale details')}</DialogTitle>
          </DialogHeader>
          <SimSaleDetailDialogContent
            simSaleId={viewingSimSaleId ?? undefined}
            fallbackCustomerName={customer.name}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={loadSaleDialogOpen}
        onOpenChange={(open) => {
          setLoadSaleDialogOpen(open);
          if (!open) setViewingLoadTxId(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('Load sale details')}</DialogTitle>
          </DialogHeader>
          <LoadSaleDetailDialogContent
            transactionId={viewingLoadTxId ?? undefined}
            fallbackCustomerName={customer.name}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={cashWithdrawalDialogOpen}
        onOpenChange={(open) => {
          setCashWithdrawalDialogOpen(open);
          if (!open) setViewingCashWithdrawalId(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('Cash Management transaction')}</DialogTitle>
          </DialogHeader>
          <CashWithdrawalDetailDialogContent
            withdrawalId={viewingCashWithdrawalId ?? undefined}
            fallbackCustomerName={customer.name}
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
                name: customer.name,
                nameUrdu: customer.nameUrdu,
                phone: customer.phone,
                address: customer.address,
              }}
              payment={{
                amount: selectedPayment.entry.credit,
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
          <CardTitle className="flex flex-wrap items-center gap-2">
            {customer.name}
            {(customer.phone || customer.whatsapp) && (
              <WhatsAppSendButton
                phone={customer.phone}
                whatsapp={customer.whatsapp}
                name={customer.name}
                showLabel
                size="sm"
                variant="outline"
              />
            )}
          </CardTitle>
          <CardDescription>{t('Transaction History and Balance')}</CardDescription>
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
                    <span className="text-sm text-red-600 ml-2">({t('Receivable')})</span>
                  )}
                  {currentBalance < 0 && (
                    <span className="text-sm text-green-600 ml-2">({t('Payable')})</span>
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
              <p className={`mt-1 text-lg font-semibold tabular-nums ${getLedgerBalanceTone('customer', openingBalance)}`}>
                {formatLedgerBalanceLabel('customer', openingBalance, t)}
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
              <p className={`mt-1 text-lg font-semibold tabular-nums ${getLedgerBalanceTone('customer', periodSummary.closingBalance)}`}>
                {formatLedgerBalanceLabel('customer', periodSummary.closingBalance, t)}
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
                        variant={action.cashAction === 'receive' ? 'outline' : 'default'}
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
