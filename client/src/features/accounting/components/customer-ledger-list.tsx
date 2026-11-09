import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/context/language-context';
import { Download, MessageSquare } from 'lucide-react';
import { BulkSmsDialog } from '@/components/sms/bulk-sms-dialog';
import { useBranchName } from '@/hooks/use-branch-name';
import * as XLSX from 'xlsx';
import Axios from '@/utils/Axios';
import summery from '@/utils/summery';
import { toast } from 'sonner';
import {
  CustomerLedgerCardGrid,
  type CustomerWithBalance,
} from './customer-ledger-card-grid';
import { CustomerLedgerTable } from './customer-ledger-table';
import { LedgerListToolbar } from './ledger-list-toolbar';
import { BalanceSheetPrintButton } from './balance-sheet-print-button';
import {
  getStoredLedgerListViewMode,
  storeLedgerListViewMode,
  type LedgerListViewMode,
} from '../utils/ledger-list-view';
import { usePersistedListState } from '@/hooks/use-persisted-list-state';
import { matchesBilingualSearch } from '@/utils/urdu-text-utils'
import { CREDIT_STATUS_META } from '@/features/customers/credit/credit-utils';
import { useLedgerStatus } from '@/features/ledger-alerts/hooks/use-ledger-alerts';
import { LedgerColorLegend } from '@/features/ledger-alerts/components/ledger-color-legend';
import { describeDays, matchesLedgerFilter, type LedgerColorFilter } from '@/features/ledger-alerts/lib/ledger-colors';

const VIEW_MODE_KEY = 'customer-ledger-list-view';
const LIST_STATE_KEY = 'customer-ledger-list-state';

interface CustomerLedgerListProps {
  onSelectCustomer: (customer: CustomerWithBalance) => void;
}

function ledgerRowMatchesSearch(
  term: string,
  row: { name?: string; nameUrdu?: string; phone?: string },
): boolean {
  return matchesBilingualSearch(term, row.name, row.phone, row.nameUrdu);
}

export function CustomerLedgerList({ onSelectCustomer }: CustomerLedgerListProps) {
  const { t } = useLanguage();
  const [customers, setCustomers] = useState<CustomerWithBalance[]>([]);
  // Starts true (not false) because the mount-time fetch effect below hasn't run yet when
  // the scroll-restore effect's first pass checks this flag — starting false made it treat
  // the pre-fetch empty list as "loaded" and burn its one-shot restore on nothing.
  const [loading, setLoading] = useState(true);
  const {
    search: searchTerm,
    setSearch: setSearchTerm,
    page: currentPage,
    setPage: setCurrentPage,
    limit,
    setLimit,
    restoreScroll,
  } = usePersistedListState(LIST_STATE_KEY);
  const [totalPages, setTotalPages] = useState(1);
  const [bulkSmsOpen, setBulkSmsOpen] = useState(false);
  const [creditFilter, setCreditFilter] = useState<'all' | 'over' | 'near' | 'hold' | 'limited'>('all');
  // Overdue colour filter (Settings → Due Dates & Ledger Colours).
  const [colorFilter, setColorFilter] = useState<LedgerColorFilter>('all');
  const { board: ledgerBoard, agingFor, toneFor, settings: ledgerSettings, colorsOn } = useLedgerStatus();
  const branchName = useBranchName();
  const [viewMode, setViewMode] = useState<LedgerListViewMode>(() =>
    getStoredLedgerListViewMode(VIEW_MODE_KEY),
  );

  useEffect(() => {
    fetchCustomers();
  }, [currentPage, limit]);

  // Once this render's rows are actually on screen, restore the scroll position the user
  // was at before they drilled into a customer's ledger — restoring any earlier has nothing
  // to scroll to yet. No-ops after the first successful restore.
  useEffect(() => {
    if (!loading) restoreScroll();
  }, [loading, restoreScroll]);

  const handleViewModeChange = (mode: LedgerListViewMode) => {
    setViewMode(mode);
    storeLedgerListViewMode(VIEW_MODE_KEY, mode);
  };

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const response = await Axios.get(summery.fetchCustomersWithBalances.url, {
        params: {
          page: currentPage,
          limit,
          sortBy: 'name:asc'
        }
      });
      setCustomers(response.data?.results || response.data || []);
      setTotalPages(response.data?.totalPages || 1);
    } catch (error: any) {
      toast.error(t('Failed to load customers'));
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    try {
      const data = filteredCustomers.map(customer => ({
        'Customer Name': customer.name,
        'Phone': customer.phone || '-',
        'Balance': customer.balance.toFixed(2),
        'Status': customer.balance > 0 ? 'Receivable' : customer.balance < 0 ? 'Payable' : 'Settled',
        'Credit Limit': customer.credit?.hasLimit ? customer.credit.limit : '',
        'Credit Used': customer.credit?.hasLimit ? customer.credit.exposure : '',
        'Credit Available': customer.credit?.hasLimit ? customer.credit.available ?? '' : '',
        'Credit Status': customer.credit ? CREDIT_STATUS_META[customer.credit.status].label : '',
        'Due Status': (() => {
          const aging = agingFor(customer._id);
          return aging ? describeDays(aging.state, aging.oldestDaysOverdue, null) : '';
        })(),
        'Overdue Amount': agingFor(customer._id)?.overdueAmount || '',
        'Last Transaction': customer.lastTransactionDate || '-'
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Customers');
      XLSX.writeFile(wb, `customer-ledger-${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success(t('Data exported successfully'));
    } catch (error) {
      console.error('Export error:', error);
      toast.error(t('Failed to export data'));
    }
  };

  // Credit filter chips — only shown once some customer has a limit or is on hold.
  const creditCounts = {
    over: customers.filter((c) => c.credit?.status === 'over').length,
    near: customers.filter((c) => c.credit?.status === 'near').length,
    hold: customers.filter((c) => c.credit?.status === 'hold').length,
    limited: customers.filter((c) => c.credit?.hasLimit || c.credit?.onHold).length,
  };
  // A colour filter spans ALL pages: the server pages this list, so the matching customers
  // come from the ledger status board instead (it already holds every customer who owes).
  const colorRows: CustomerWithBalance[] | null =
    colorFilter !== 'all' && ledgerBoard
      ? ledgerBoard.rows
          .filter((row) => matchesLedgerFilter(row, colorFilter))
          .map((row) => {
            const onPage = customers.find((c) => c._id === row.customerId);
            return onPage ?? { _id: row.customerId, name: row.name, nameUrdu: row.nameUrdu, phone: row.phone, whatsapp: row.whatsapp, balance: row.balance };
          })
      : null;
  const filteredCustomers = (colorRows ?? customers).filter(
    (customer) =>
      ledgerRowMatchesSearch(searchTerm, customer) &&
      (creditFilter === 'all' ||
        (creditFilter === 'limited'
          ? Boolean(customer.credit?.hasLimit || customer.credit?.onHold)
          : customer.credit?.status === creditFilter)),
  );

  const pagination = {
    totalPage: colorRows ? 1 : totalPages,
    currentPage,
    setCurrentPage,
    limit,
    setLimit: (n: number) => {
      setLimit(n);
      setCurrentPage(1);
    },
  };

  return (
    // Phones: no card chrome or side padding, so the list uses the full screen width.
    <Card className="max-sm:gap-4 max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:py-0 max-sm:shadow-none">
      <CardHeader className="max-sm:px-0">
        <div>
          <CardTitle>{t('Customer Ledger')}</CardTitle>
          <CardDescription>{t('View all customer balances and transactions')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="max-sm:px-0">
        <LedgerListToolbar
          searchInput={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder={t('Search customers...')}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          actions={
            <div className="flex items-center gap-2 max-sm:grid max-sm:grid-cols-3">
              <Button variant="outline" onClick={() => setBulkSmsOpen(true)} className="shrink-0 max-sm:w-full max-sm:px-2">
                <MessageSquare className="w-4 h-4 mr-2 max-sm:mr-1.5" />
                <span className="max-sm:hidden">{t('Send SMS')}</span>
                <span className="sm:hidden">{t('SMS')}</span>
              </Button>
              <BalanceSheetPrintButton
                party="customer"
                rows={ledgerSettings.printColors ? customers.map((c) => ({ ...c, color: toneFor(c._id)?.color ?? null })) : customers}
                colorLegend={ledgerSettings.printColors && colorsOn ? [
                  ...ledgerSettings.bands.map((b) => ({ label: b.label, color: b.color })),
                  { label: ledgerSettings.dueTodayLabel, color: ledgerSettings.dueTodayColor },
                  ...(ledgerSettings.dueSoonEnabled ? [{ label: ledgerSettings.dueSoonLabel, color: ledgerSettings.dueSoonColor }] : []),
                ] : undefined}
                disabled={loading}
              />
              <Button variant="outline" onClick={exportToExcel} className="shrink-0 max-sm:w-full max-sm:px-2">
                <Download className="w-4 h-4 mr-2 max-sm:mr-1.5" />
                <span className="max-sm:hidden">{t('Export to Excel')}</span>
                <span className="sm:hidden">{t('Excel')}</span>
              </Button>
            </div>
          }
        />

        {creditCounts.limited > 0 && (
          // Phones: one swipeable row instead of three wrapped lines of chips.
          <div className="mb-3 flex flex-wrap items-center gap-1.5 max-sm:no-scrollbar max-sm:flex-nowrap max-sm:overflow-x-auto">
            <span className="mr-1 shrink-0 text-xs text-muted-foreground">{t('Credit')}:</span>
            {(
              [
                ['all', t('All'), customers.length],
                ['over', t('Over limit'), creditCounts.over],
                ['near', t('Near limit'), creditCounts.near],
                ['hold', t('On hold'), creditCounts.hold],
                ['limited', t('Has a limit'), creditCounts.limited],
              ] as const
            ).map(([key, label, count]) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={creditFilter === key ? 'default' : 'outline'}
                className="h-7 shrink-0 px-2.5 text-xs"
                onClick={() => setCreditFilter(key)}
              >
                {label}
                <span className="ml-1 tabular-nums opacity-70">{count}</span>
              </Button>
            ))}
          </div>
        )}

        <LedgerColorLegend
          board={ledgerBoard}
          filter={colorFilter}
          onFilterChange={setColorFilter}
          className="mb-3 max-sm:no-scrollbar max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:py-1 max-sm:[&>*]:shrink-0"
        />

        {viewMode === 'cards' ? (
          <CustomerLedgerCardGrid
            customers={filteredCustomers}
            loading={loading}
            onSelectCustomer={onSelectCustomer}
            pagination={pagination}
          />
        ) : (
          <CustomerLedgerTable
            customers={filteredCustomers}
            loading={loading}
            onSelectCustomer={onSelectCustomer}
            pagination={pagination}
          />
        )}
      </CardContent>

      <BulkSmsDialog
        open={bulkSmsOpen}
        onOpenChange={setBulkSmsOpen}
        recipients={filteredCustomers}
        entityType="customer"
        branchName={branchName}
      />
    </Card>
  );
}
