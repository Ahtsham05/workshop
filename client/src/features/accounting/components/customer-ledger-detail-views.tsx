import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useDispatch } from 'react-redux';
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Loader2, Package, Search } from 'lucide-react';
import type { AppDispatch } from '@/stores/store';
import { invoiceApi, useGetInvoiceHistoryQuery } from '@/stores/invoice.api';
import type { TransactionHistoryEntry, TransactionHistoryItem } from '@/stores/transactionHistory.types';
import { useFormatMoney, useCurrencyMeta } from '@/lib/format-money';
import { formatAppDate } from '@/lib/date-format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  formatLedgerBalanceLabel,
  getLedgerBalanceTone,
} from '@/features/accounting/utils/ledger-display';
import {
  isManualLedgerEntry,
  isLoadSaleLedgerRow,
  isSimSaleLedgerRow,
} from '@/features/accounting/utils/customer-ledger-categories';
import type { LedgerStatementEntry } from './ledger-statement-table';
import { DiscountLineInfo } from '@/features/ledger-discounts/components/discount-line-info';
import { isDiscountType } from '@/features/ledger-discounts/lib/ledger-discounts';

type T = (key: string) => string;

/** A real sale invoice (not a SIM/load sale or a hand-made ledger line) — the rows that have products. */
export const isItemizedSaleEntry = (entry: LedgerStatementEntry) =>
  entry.transactionType === 'sale' &&
  Boolean(entry.referenceId) &&
  !isManualLedgerEntry(entry as never) &&
  !isSimSaleLedgerRow(entry as never) &&
  !isLoadSaleLedgerRow(entry as never);

const entryKey = (entry: LedgerStatementEntry) => String(entry.id || entry._id);
const isZero = (n: number) => Math.abs(n) < 0.005;

type PopulatedProduct = { _id?: string; id?: string; nameUrdu?: string; sku?: string };
interface RawInvoiceItem {
  productId?: string | PopulatedProduct | null;
  name?: string;
  nameUrdu?: string;
  quantity?: number;
  unitPrice?: number;
  unit?: string;
  discountAmount?: number;
  taxAmount?: number;
  subtotal?: number;
  imeis?: unknown[];
}
interface RawInvoice {
  _id?: string;
  id?: string;
  invoiceNumber: string;
  billNumber?: string;
  invoiceDate?: string;
  createdAt: string;
  type?: string;
  paymentMethod?: string;
  discount?: number;
  tax?: number;
  deliveryCharge?: number;
  serviceCharge?: number;
  total?: number;
  settledAmount?: number;
  paidAmount?: number;
  remainingAmount?: number;
  balance?: number;
  settlementStatus?: TransactionHistoryEntry['settlementStatus'];
  items?: RawInvoiceItem[];
}

/** GET /invoices/:id → the same flat shape /invoices/history returns. */
function toHistoryEntry(invoice: RawInvoice): TransactionHistoryEntry {
  const items: TransactionHistoryItem[] = (invoice.items || []).map((item) => {
    const quantity = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    const product = item.productId && typeof item.productId === 'object' ? item.productId : null;
    return {
      productId: product ? product._id || product.id || null : (item.productId as string) || null,
      name: item.name || 'Unknown Product',
      nameUrdu: item.nameUrdu || product?.nameUrdu || '',
      sku: product?.sku || '',
      quantity,
      unit: item.unit || '',
      price,
      salePrice: null,
      discountAmount: Number(item.discountAmount) || 0,
      taxAmount: Number(item.taxAmount) || 0,
      total: Number(item.subtotal ?? quantity * price) || 0,
      imeiCount: Array.isArray(item.imeis) ? item.imeis.length : 0,
    };
  });
  return {
    id: String(invoice._id || invoice.id),
    invoiceNumber: invoice.invoiceNumber,
    referenceNumber: invoice.billNumber || '',
    date: invoice.invoiceDate || invoice.createdAt,
    partyId: null,
    partyName: '',
    type: invoice.type || 'cash',
    paymentMethod: invoice.paymentMethod || 'cash',
    discount: Number(invoice.discount) || 0,
    tax: Number(invoice.tax) || 0,
    charges: (Number(invoice.deliveryCharge) || 0) + (Number(invoice.serviceCharge) || 0),
    total: Number(invoice.total) || 0,
    paid: Number(invoice.settledAmount ?? invoice.paidAmount) || 0,
    remaining: Number(invoice.remainingAmount ?? invoice.balance) || 0,
    settlementStatus: invoice.settlementStatus,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    items,
  };
}

/**
 * Products of every sale invoice on the statement. One bulk call (/invoices/history for this
 * customer and period); any invoice it misses — e.g. a sale whose invoice date differs from its
 * ledger date — is then loaded on its own.
 */
export function useLedgerInvoiceDetails({
  customerId,
  entries,
  startDate,
  endDate,
  enabled,
}: {
  customerId: string;
  entries: LedgerStatementEntry[];
  startDate?: string;
  endDate?: string;
  enabled: boolean;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const saleIds = useMemo(
    () => [...new Set(entries.filter(isItemizedSaleEntry).map((e) => String(e.referenceId)))],
    [entries],
  );
  const { data, isFetching, isError } = useGetInvoiceHistoryQuery(
    { customerId, startDate, endDate, limit: 2000 },
    { skip: !enabled || !customerId || saleIds.length === 0 },
  );
  const [extra, setExtra] = useState<Map<string, TransactionHistoryEntry | null>>(new Map());
  const [loadingExtra, setLoadingExtra] = useState(false);
  const triedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled || !data) return;
    const have = new Set(data.results.map((r) => r.id));
    const missing = saleIds.filter((id) => !have.has(id) && !triedRef.current.has(id)).slice(0, 60);
    if (missing.length === 0) return;
    missing.forEach((id) => triedRef.current.add(id));
    let cancelled = false;
    setLoadingExtra(true);
    Promise.all(
      missing.map(async (id): Promise<[string, TransactionHistoryEntry | null]> => {
        const sub = dispatch(invoiceApi.endpoints.getInvoiceById.initiate(id));
        try {
          return [id, toHistoryEntry(await sub.unwrap())];
        } catch {
          return [id, null];
        } finally {
          sub.unsubscribe();
        }
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setExtra((prev) => {
        const next = new Map(prev);
        pairs.forEach(([id, value]) => next.set(id, value));
        return next;
      });
      setLoadingExtra(false);
    });
    return () => {
      cancelled = true;
      setLoadingExtra(false);
    };
  }, [enabled, data, saleIds, dispatch]);

  const detailsById = useMemo(() => {
    const map = new Map<string, TransactionHistoryEntry>();
    data?.results.forEach((r) => map.set(r.id, r));
    extra.forEach((value, id) => {
      if (value && !map.has(id)) map.set(id, value);
    });
    return map;
  }, [data, extra]);

  return { detailsById, loading: isFetching || loadingExtra, failed: isError };
}

interface SharedProps {
  entries: LedgerStatementEntry[];
  openingBalance: number;
  detailsById: Map<string, TransactionHistoryEntry>;
  loading: boolean;
  failed: boolean;
  t: T;
  getTypeLabel: (entry: LedgerStatementEntry) => string;
  getTypeBadgeVariant: (type: string) => 'default' | 'secondary' | 'destructive' | 'outline';
  renderReference: (entry: LedgerStatementEntry) => ReactNode;
  renderActions: (entry: LedgerStatementEntry) => ReactNode;
}

function DetailsStatus({ loading, failed, t }: { loading: boolean; failed: boolean; t: T }) {
  if (loading) {
    return (
      <span className='inline-flex items-center gap-1.5 text-xs text-muted-foreground'>
        <Loader2 className='h-3.5 w-3.5 animate-spin' />
        {t('Loading invoice items...')}
      </span>
    );
  }
  if (failed) {
    return (
      <span className='text-xs text-amber-700 dark:text-amber-400'>
        {t('Invoice items could not be loaded (needs View Invoices permission).')}
      </span>
    );
  }
  return null;
}

const SETTLEMENT_TONE: Record<string, string> = {
  paid: 'border-green-300 text-green-700 dark:text-green-400',
  overpaid: 'border-green-300 text-green-700 dark:text-green-400',
  partial: 'border-amber-300 text-amber-700 dark:text-amber-400',
  unpaid: 'border-red-300 text-red-700 dark:text-red-400',
};
const SETTLEMENT_LABEL: Record<string, string> = {
  paid: 'Paid',
  overpaid: 'Paid',
  partial: 'Partly paid',
  unpaid: 'Unpaid',
};

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, ''));

function OpeningRow({ colSpan, label, balance, t, trailing = 1 }: { colSpan: number; label: string; balance: number; t: T; trailing?: number }) {
  const currencyMeta = useCurrencyMeta();
  return (
    <TableRow className='bg-muted/30 font-medium hover:bg-muted/30'>
      <TableCell colSpan={colSpan} className='text-sm text-muted-foreground'>
        {label}
      </TableCell>
      <TableCell className={cn('text-right tabular-nums', getLedgerBalanceTone('customer', balance))}>
        {formatLedgerBalanceLabel('customer', balance, t, currencyMeta)}
      </TableCell>
      {trailing > 0 && <TableCell colSpan={trailing} />}
    </TableRow>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Invoice-wise: one row per voucher; each sale opens to its products and how the bill adds up. */
/* ------------------------------------------------------------------------------------------ */

export function LedgerInvoiceWiseView({
  entries,
  openingBalance,
  detailsById,
  loading,
  failed,
  t,
  getTypeLabel,
  getTypeBadgeVariant,
  renderReference,
  renderActions,
}: SharedProps) {
  const formatMoney = useFormatMoney();
  const currencyMeta = useCurrencyMeta();
  // Collapsed rows are tracked (not expanded ones), so every invoice starts open.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const itemizedKeys = useMemo(
    () => entries.filter(isItemizedSaleEntry).map(entryKey),
    [entries],
  );
  const allCollapsed = itemizedKeys.length > 0 && itemizedKeys.every((k) => collapsed.has(k));

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    let invoices = 0;
    let qty = 0;
    entries.forEach((e) => {
      debit += Number(e.debit) || 0;
      credit += Number(e.credit) || 0;
      if (isItemizedSaleEntry(e)) {
        invoices += 1;
        qty += detailsById.get(String(e.referenceId))?.totalQuantity ?? 0;
      }
    });
    return { debit, credit, invoices, qty };
  }, [entries, detailsById]);
  const closing = entries.length ? entries[entries.length - 1].balance : openingBalance;

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex flex-wrap items-center gap-2 text-sm'>
          <Badge variant='outline' className='font-normal'>
            {totals.invoices} {t('invoices')}
          </Badge>
          {totals.qty > 0 && (
            <Badge variant='outline' className='font-normal'>
              {fmtQty(totals.qty)} {t('items sold')}
            </Badge>
          )}
          <DetailsStatus loading={loading} failed={failed} t={t} />
        </div>
        {itemizedKeys.length > 0 && (
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='h-8 gap-1.5'
            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(itemizedKeys))}
          >
            {allCollapsed ? <ChevronsUpDown className='h-4 w-4' /> : <ChevronsDownUp className='h-4 w-4' />}
            {allCollapsed ? t('Expand all') : t('Collapse all')}
          </Button>
        )}
      </div>

      <div className='overflow-x-auto rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow className='bg-muted/40'>
              <TableHead className='w-8' />
              <TableHead>{t('Date')}</TableHead>
              <TableHead>{t('Voucher')}</TableHead>
              <TableHead className='min-w-[200px]'>{t('Details')}</TableHead>
              <TableHead className='text-right'>{t('Debit')}</TableHead>
              <TableHead className='text-right'>{t('Credit')}</TableHead>
              <TableHead className='text-right min-w-[130px]'>{t('Balance')}</TableHead>
              <TableHead className='text-right w-[1%] whitespace-nowrap'>{t('Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <OpeningRow colSpan={6} label={t('Opening Balance')} balance={openingBalance} t={t} />
            {entries.map((entry) => {
              const key = entryKey(entry);
              const itemized = isItemizedSaleEntry(entry);
              const detail = itemized ? detailsById.get(String(entry.referenceId)) : undefined;
              const open = itemized && !collapsed.has(key);
              return (
                <Fragment key={key}>
                  <TableRow className={cn('border-t', open && 'border-b-0 bg-muted/10')}>
                    <TableCell className='px-1 text-center'>
                      {itemized && (
                        <button
                          type='button'
                          onClick={() => toggle(key)}
                          className='inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted'
                          aria-label={open ? t('Hide products') : t('Show products')}
                          aria-expanded={open}
                        >
                          {open ? <ChevronDown className='h-4 w-4' /> : <ChevronRight className='h-4 w-4' />}
                        </button>
                      )}
                    </TableCell>
                    <TableCell className='whitespace-nowrap text-sm tabular-nums'>
                      {formatAppDate(new Date(entry.transactionDate))}
                    </TableCell>
                    <TableCell>
                      <div className='flex flex-col items-start gap-1'>
                        <Badge variant={getTypeBadgeVariant(entry.transactionType)} className='whitespace-nowrap'>
                          {getTypeLabel(entry)}
                        </Badge>
                        <span className='text-sm'>{renderReference(entry)}</span>
                      </div>
                    </TableCell>
                    <TableCell className='text-sm'>
                      {detail ? (
                        <div className='flex flex-wrap items-center gap-2'>
                          <span className='font-medium'>
                            {detail.items.length} {detail.items.length === 1 ? t('product') : t('products')}
                          </span>
                          <span className='text-muted-foreground'>
                            · {t('Qty')} {fmtQty(detail.totalQuantity)}
                          </span>
                          {detail.settlementStatus && (
                            <Badge variant='outline' className={cn('font-normal', SETTLEMENT_TONE[detail.settlementStatus])}>
                              {t(SETTLEMENT_LABEL[detail.settlementStatus] || detail.settlementStatus)}
                            </Badge>
                          )}
                        </div>
                      ) : isDiscountType(entry.transactionType) ? (
                        <DiscountLineInfo entry={entry} t={t} />
                      ) : (
                        <span className='line-clamp-2' title={entry.description}>
                          {entry.description}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className='text-right tabular-nums text-red-600'>
                      {entry.debit > 0 ? formatMoney(entry.debit) : '—'}
                    </TableCell>
                    <TableCell className='text-right tabular-nums text-green-600'>
                      {entry.credit > 0 ? formatMoney(entry.credit) : '—'}
                    </TableCell>
                    <TableCell className={cn('text-right tabular-nums text-sm', getLedgerBalanceTone('customer', entry.balance))}>
                      {formatLedgerBalanceLabel('customer', entry.balance, t, currencyMeta)}
                    </TableCell>
                    <TableCell className='text-right whitespace-nowrap'>{renderActions(entry)}</TableCell>
                  </TableRow>
                  {open && (
                    <TableRow className='bg-muted/10 hover:bg-muted/10'>
                      <TableCell />
                      <TableCell colSpan={7} className='pt-0 pb-4'>
                        {detail ? (
                          <InvoiceItemsPanel detail={detail} t={t} />
                        ) : (
                          <div className='rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground'>
                            {loading ? t('Loading invoice items...') : t('Product details are not available for this invoice.')}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
            <TableRow className='border-t-2 bg-muted/40 font-semibold hover:bg-muted/40'>
              <TableCell colSpan={4} className='text-sm'>
                {t('Total')}
              </TableCell>
              <TableCell className='text-right tabular-nums text-red-700'>{formatMoney(totals.debit)}</TableCell>
              <TableCell className='text-right tabular-nums text-green-700'>{formatMoney(totals.credit)}</TableCell>
              <TableCell className={cn('text-right tabular-nums', getLedgerBalanceTone('customer', closing))}>
                {formatLedgerBalanceLabel('customer', closing, t, currencyMeta)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function InvoiceItemsPanel({ detail, t }: { detail: TransactionHistoryEntry; t: T }) {
  const formatMoney = useFormatMoney();
  const itemsTotal = detail.items.reduce((sum, item) => sum + item.total, 0);
  const charges = Number(detail.charges) || 0;
  // Whatever the named parts don't explain (rounding, older bills) — keeps the sum honest.
  const other = detail.total - (itemsTotal - detail.discount + detail.tax + charges);
  const summary: Array<{ label: string; value: number; sign?: '−' | '+'; strong?: boolean }> = [
    { label: t('Items total'), value: itemsTotal },
    ...(detail.discount > 0 ? [{ label: t('Bill discount'), value: detail.discount, sign: '−' as const }] : []),
    ...(detail.tax > 0 ? [{ label: t('Tax'), value: detail.tax, sign: '+' as const }] : []),
    ...(charges > 0 ? [{ label: t('Delivery / service charges'), value: charges, sign: '+' as const }] : []),
    ...(!isZero(other) ? [{ label: t('Adjustment'), value: Math.abs(other), sign: other < 0 ? ('−' as const) : ('+' as const) }] : []),
    { label: t('Bill total'), value: detail.total, strong: true },
  ];

  return (
    <div className='overflow-hidden rounded-md border bg-background'>
      <div className='overflow-x-auto'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='border-b bg-muted/40 text-xs text-muted-foreground'>
              <th className='w-8 px-3 py-2 text-center font-medium'>#</th>
              <th className='px-3 py-2 text-left font-medium'>{t('Product')}</th>
              <th className='px-3 py-2 text-right font-medium'>{t('Qty')}</th>
              <th className='px-3 py-2 text-right font-medium'>{t('Rate')}</th>
              <th className='px-3 py-2 text-right font-medium'>{t('Discount')}</th>
              <th className='px-3 py-2 text-right font-medium'>{t('Amount')}</th>
            </tr>
          </thead>
          <tbody>
            {detail.items.map((item, idx) => (
              <tr key={idx} className='border-b last:border-b-0'>
                <td className='px-3 py-1.5 text-center text-xs text-muted-foreground tabular-nums'>{idx + 1}</td>
                <td className='px-3 py-1.5'>
                  <div className='font-medium'>{item.name}</div>
                  {(item.nameUrdu || item.sku || item.imeiCount > 0) && (
                    <div className='flex flex-wrap gap-x-3 text-xs text-muted-foreground'>
                      {item.nameUrdu && <span dir='auto'>{item.nameUrdu}</span>}
                      {item.sku && <span>{item.sku}</span>}
                      {item.imeiCount > 0 && <span>{item.imeiCount} IMEI</span>}
                    </div>
                  )}
                </td>
                <td className='px-3 py-1.5 text-right tabular-nums whitespace-nowrap'>
                  {fmtQty(item.quantity)}
                  {item.unit ? <span className='ml-1 text-xs text-muted-foreground'>{item.unit}</span> : null}
                </td>
                <td className='px-3 py-1.5 text-right tabular-nums'>{formatMoney(item.price)}</td>
                <td className='px-3 py-1.5 text-right tabular-nums text-muted-foreground'>
                  {item.discountAmount > 0 ? formatMoney(item.discountAmount) : '—'}
                </td>
                <td className='px-3 py-1.5 text-right font-medium tabular-nums'>{formatMoney(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className='flex flex-col gap-3 border-t bg-muted/20 px-3 py-2 sm:flex-row sm:items-end sm:justify-between'>
        <div className='flex flex-wrap gap-x-4 gap-y-1 text-xs'>
          <span className='text-muted-foreground'>
            {t('Paid on bill')}: <span className='font-medium text-foreground tabular-nums'>{formatMoney(detail.paid)}</span>
          </span>
          <span className='text-muted-foreground'>
            {t('Remaining')}:{' '}
            <span className={cn('font-medium tabular-nums', detail.remaining > 0 ? 'text-red-600' : 'text-foreground')}>
              {formatMoney(detail.remaining)}
            </span>
          </span>
        </div>
        <dl className='grid min-w-[220px] grid-cols-[1fr_auto] gap-x-6 gap-y-0.5 text-sm'>
          {summary.map((row) => (
            <Fragment key={row.label}>
              <dt className={cn('text-muted-foreground', row.strong && 'border-t pt-1 font-semibold text-foreground')}>
                {row.label}
              </dt>
              <dd className={cn('text-right tabular-nums', row.strong && 'border-t pt-1 font-semibold')}>
                {row.sign ? `${row.sign} ` : ''}
                {formatMoney(row.value)}
              </dd>
            </Fragment>
          ))}
        </dl>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Product-wise: the statement one line per product sold, plus a per-product summary.          */
/* ------------------------------------------------------------------------------------------ */

type ProductTab = 'ledger' | 'summary';

export function LedgerProductWiseView(props: SharedProps) {
  const { t, loading, failed } = props;
  const [tab, setTab] = useState<ProductTab>('ledger');
  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex items-center gap-1 rounded-lg border p-1'>
          <Button
            type='button'
            size='sm'
            variant={tab === 'ledger' ? 'secondary' : 'ghost'}
            className='h-7'
            onClick={() => setTab('ledger')}
          >
            {t('Product ledger')}
          </Button>
          <Button
            type='button'
            size='sm'
            variant={tab === 'summary' ? 'secondary' : 'ghost'}
            className='h-7'
            onClick={() => setTab('summary')}
          >
            {t('Product summary')}
          </Button>
        </div>
        <DetailsStatus loading={loading} failed={failed} t={t} />
      </div>
      {tab === 'ledger' ? <ProductLedgerTable {...props} /> : <ProductSummaryTable {...props} />}
    </div>
  );
}

interface ProductLine {
  product: ReactNode;
  qty?: ReactNode;
  rate?: number;
  debit: number;
  credit: number;
  muted?: boolean;
}

function ProductLedgerTable({
  entries,
  openingBalance,
  detailsById,
  t,
  getTypeLabel,
  getTypeBadgeVariant,
  renderReference,
  renderActions,
}: SharedProps) {
  const formatMoney = useFormatMoney();
  const currencyMeta = useCurrencyMeta();
  const totals = useMemo(
    () =>
      entries.reduce(
        (acc, e) => ({ debit: acc.debit + (Number(e.debit) || 0), credit: acc.credit + (Number(e.credit) || 0) }),
        { debit: 0, credit: 0 },
      ),
    [entries],
  );
  const closing = entries.length ? entries[entries.length - 1].balance : openingBalance;

  const linesFor = (entry: LedgerStatementEntry): ProductLine[] => {
    const debit = Number(entry.debit) || 0;
    const credit = Number(entry.credit) || 0;
    const detail = isItemizedSaleEntry(entry) ? detailsById.get(String(entry.referenceId)) : undefined;
    if (isDiscountType(entry.transactionType)) {
      return [{ product: <DiscountLineInfo entry={entry} t={t} />, debit, credit }];
    }
    if (!detail || detail.items.length === 0) {
      return [{ product: <span className='text-muted-foreground'>{entry.description}</span>, debit, credit }];
    }
    let itemsTotal = 0;
    const lines: ProductLine[] = detail.items.map((item) => {
      itemsTotal += item.total;
      return {
        product: (
          <span>
            <span className='font-medium'>{item.name}</span>
            {item.nameUrdu && (
              <span dir='auto' className='ml-2 text-xs text-muted-foreground'>
                {item.nameUrdu}
              </span>
            )}
          </span>
        ),
        qty: (
          <>
            {fmtQty(item.quantity)}
            {item.unit ? <span className='ml-1 text-xs text-muted-foreground'>{item.unit}</span> : null}
          </>
        ),
        rate: item.price,
        debit: item.total,
        credit: 0,
      };
    });
    // Same rule as the printed product-wise statement: one line carries the difference to the
    // posted bill (discount / tax / charges) so the balance always adds up.
    const diff = debit - itemsTotal;
    if (!isZero(diff)) {
      lines.push({
        product: <span className='italic'>{t('Bill adjustment (discount / tax / charges)')}</span>,
        debit: diff,
        credit: 0,
        muted: true,
      });
    }
    if (!isZero(credit)) lines[lines.length - 1].credit = credit;
    return lines;
  };

  const money = (n: number) => (isZero(n) ? '' : n < 0 ? `− ${formatMoney(Math.abs(n))}` : formatMoney(n));

  return (
    <div className='overflow-x-auto rounded-lg border'>
      <Table>
        <TableHeader>
          <TableRow className='bg-muted/40'>
            <TableHead>{t('Date')}</TableHead>
            <TableHead>{t('Voucher')}</TableHead>
            <TableHead className='min-w-[220px]'>{t('Product / Details')}</TableHead>
            <TableHead className='text-right'>{t('Qty')}</TableHead>
            <TableHead className='text-right'>{t('Rate')}</TableHead>
            <TableHead className='text-right'>{t('Debit')}</TableHead>
            <TableHead className='text-right'>{t('Credit')}</TableHead>
            <TableHead className='text-right min-w-[130px]'>{t('Balance')}</TableHead>
            <TableHead className='text-right w-[1%] whitespace-nowrap'>{t('Actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <OpeningRow colSpan={7} label={t('Opening Balance')} balance={openingBalance} t={t} />
          {entries.map((entry) => {
            const lines = linesFor(entry);
            const span = lines.length;
            return lines.map((line, idx) => {
              const first = idx === 0;
              const last = idx === span - 1;
              return (
                <TableRow
                  key={`${entryKey(entry)}-${idx}`}
                  className={cn(first ? 'border-t-2 border-t-border' : 'border-t-0', !last && 'border-b-0', 'hover:bg-transparent')}
                >
                  {first && (
                    <>
                      <TableCell rowSpan={span} className='align-top whitespace-nowrap text-sm tabular-nums'>
                        {formatAppDate(new Date(entry.transactionDate))}
                      </TableCell>
                      <TableCell rowSpan={span} className='align-top'>
                        <div className='flex flex-col items-start gap-1'>
                          <Badge variant={getTypeBadgeVariant(entry.transactionType)} className='whitespace-nowrap'>
                            {getTypeLabel(entry)}
                          </Badge>
                          <span className='text-sm'>{renderReference(entry)}</span>
                        </div>
                      </TableCell>
                    </>
                  )}
                  <TableCell className={cn('py-1.5 text-sm', line.muted && 'text-muted-foreground')}>{line.product}</TableCell>
                  <TableCell className='py-1.5 text-right text-sm tabular-nums whitespace-nowrap'>{line.qty ?? ''}</TableCell>
                  <TableCell className='py-1.5 text-right text-sm tabular-nums'>
                    {line.rate != null ? formatMoney(line.rate) : ''}
                  </TableCell>
                  <TableCell className={cn('py-1.5 text-right tabular-nums', line.muted ? 'text-muted-foreground' : 'text-red-600')}>
                    {money(line.debit)}
                  </TableCell>
                  <TableCell className='py-1.5 text-right tabular-nums text-green-600'>{money(line.credit)}</TableCell>
                  <TableCell className={cn('py-1.5 text-right text-sm tabular-nums', last && getLedgerBalanceTone('customer', entry.balance))}>
                    {last ? formatLedgerBalanceLabel('customer', entry.balance, t, currencyMeta) : ''}
                  </TableCell>
                  {first && (
                    <TableCell rowSpan={span} className='align-top text-right whitespace-nowrap'>
                      {renderActions(entry)}
                    </TableCell>
                  )}
                </TableRow>
              );
            });
          })}
          <TableRow className='border-t-2 bg-muted/40 font-semibold hover:bg-muted/40'>
            <TableCell colSpan={5} className='text-sm'>
              {t('Total')}
            </TableCell>
            <TableCell className='text-right tabular-nums text-red-700'>{formatMoney(totals.debit)}</TableCell>
            <TableCell className='text-right tabular-nums text-green-700'>{formatMoney(totals.credit)}</TableCell>
            <TableCell className={cn('text-right tabular-nums', getLedgerBalanceTone('customer', closing))}>
              {formatLedgerBalanceLabel('customer', closing, t, currencyMeta)}
            </TableCell>
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

interface ProductSummaryRow {
  key: string;
  name: string;
  nameUrdu?: string;
  unit: string;
  invoices: Set<string>;
  qty: number;
  amount: number;
  lastDate: string;
}

function ProductSummaryTable({ entries, detailsById, t }: SharedProps) {
  const formatMoney = useFormatMoney();
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const byKey = new Map<string, ProductSummaryRow>();
    entries.filter(isItemizedSaleEntry).forEach((entry) => {
      const detail = detailsById.get(String(entry.referenceId));
      if (!detail) return;
      detail.items.forEach((item) => {
        const key = `${item.productId || item.name.toLowerCase()}|${item.unit || ''}`;
        const row =
          byKey.get(key) ||
          ({ key, name: item.name, nameUrdu: item.nameUrdu, unit: item.unit || '', invoices: new Set(), qty: 0, amount: 0, lastDate: '' } as ProductSummaryRow);
        row.invoices.add(detail.id);
        row.qty += item.quantity;
        row.amount += item.total;
        if (!row.lastDate || new Date(entry.transactionDate) > new Date(row.lastDate)) row.lastDate = entry.transactionDate;
        byKey.set(key, row);
      });
    });
    return [...byKey.values()].sort((a, b) => b.amount - a.amount);
  }, [entries, detailsById]);

  const q = search.trim().toLowerCase();
  const visible = q
    ? rows.filter((r) => r.name.toLowerCase().includes(q) || (r.nameUrdu || '').toLowerCase().includes(q))
    : rows;
  const totalAmount = visible.reduce((s, r) => s + r.amount, 0);
  const totalQty = visible.reduce((s, r) => s + r.qty, 0);
  const grandAmount = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='relative w-full sm:w-72'>
          <Search className='pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Search product...')}
            className='h-9 pl-8'
          />
        </div>
        <span className='text-xs text-muted-foreground'>
          {t('Sales in this period, before bill discounts and returns')}
        </span>
      </div>
      <div className='overflow-x-auto rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow className='bg-muted/40'>
              <TableHead className='w-10 text-center'>#</TableHead>
              <TableHead className='min-w-[200px]'>{t('Product')}</TableHead>
              <TableHead className='text-right'>{t('Invoices')}</TableHead>
              <TableHead className='text-right'>{t('Qty')}</TableHead>
              <TableHead className='text-right'>{t('Avg. rate')}</TableHead>
              <TableHead className='text-right'>{t('Amount')}</TableHead>
              <TableHead className='text-right'>{t('Share')}</TableHead>
              <TableHead className='text-right'>{t('Last sold')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className='py-8 text-center text-sm text-muted-foreground'>
                  <Package className='mx-auto mb-2 h-6 w-6 opacity-50' />
                  {rows.length === 0 ? t('No products sold in this period') : t('No products match your search')}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((row, idx) => {
                const share = grandAmount > 0 ? (row.amount / grandAmount) * 100 : 0;
                return (
                  <TableRow key={row.key}>
                    <TableCell className='text-center text-xs text-muted-foreground tabular-nums'>{idx + 1}</TableCell>
                    <TableCell>
                      <div className='font-medium'>{row.name}</div>
                      {row.nameUrdu && (
                        <div className='text-xs text-muted-foreground'>
                          <span dir='auto'>{row.nameUrdu}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>{row.invoices.size}</TableCell>
                    <TableCell className='text-right tabular-nums whitespace-nowrap'>
                      {fmtQty(row.qty)}
                      {row.unit ? <span className='ml-1 text-xs text-muted-foreground'>{row.unit}</span> : null}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {row.qty > 0 ? formatMoney(row.amount / row.qty) : '—'}
                    </TableCell>
                    <TableCell className='text-right font-medium tabular-nums'>{formatMoney(row.amount)}</TableCell>
                    <TableCell className='text-right'>
                      <div className='ml-auto flex w-24 items-center justify-end gap-2'>
                        <div className='h-1.5 flex-1 overflow-hidden rounded-full bg-muted'>
                          <div className='h-full rounded-full bg-primary' style={{ width: `${Math.min(100, share)}%` }} />
                        </div>
                        <span className='w-9 text-right text-xs tabular-nums text-muted-foreground'>{share.toFixed(0)}%</span>
                      </div>
                    </TableCell>
                    <TableCell className='text-right whitespace-nowrap text-sm tabular-nums'>
                      {row.lastDate ? formatAppDate(new Date(row.lastDate)) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
            {visible.length > 0 && (
              <TableRow className='border-t-2 bg-muted/40 font-semibold hover:bg-muted/40'>
                <TableCell colSpan={3} className='text-sm'>
                  {t('Total')} · {visible.length} {t('products')}
                </TableCell>
                <TableCell className='text-right tabular-nums'>{fmtQty(totalQty)}</TableCell>
                <TableCell />
                <TableCell className='text-right tabular-nums'>{formatMoney(totalAmount)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
