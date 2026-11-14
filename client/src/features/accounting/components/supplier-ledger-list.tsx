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
  SupplierLedgerCardGrid,
  type SupplierWithBalance,
} from './supplier-ledger-card-grid';
import { SupplierLedgerTable } from './supplier-ledger-table';
import { LedgerListToolbar } from './ledger-list-toolbar';
import { BalanceSheetPrintButton } from './balance-sheet-print-button';
import {
  getStoredLedgerListViewMode,
  storeLedgerListViewMode,
  type LedgerListViewMode,
} from '../utils/ledger-list-view';
import { usePersistedListState } from '@/hooks/use-persisted-list-state';
import { matchesBilingualSearch } from '@/utils/urdu-text-utils'
import { getBusinessToday } from '@/lib/business-timezone';

const VIEW_MODE_KEY = 'supplier-ledger-list-view';
const LIST_STATE_KEY = 'supplier-ledger-list-state';

interface SupplierLedgerListProps {
  onSelectSupplier: (supplier: SupplierWithBalance) => void;
}

function ledgerRowMatchesSearch(
  term: string,
  row: { name?: string; nameUrdu?: string; phone?: string },
): boolean {
  return matchesBilingualSearch(term, row.name, row.phone, row.nameUrdu);
}

export function SupplierLedgerList({ onSelectSupplier }: SupplierLedgerListProps) {
  const { t } = useLanguage();
  const [suppliers, setSuppliers] = useState<SupplierWithBalance[]>([]);
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
  const branchName = useBranchName();
  const [viewMode, setViewMode] = useState<LedgerListViewMode>(() =>
    getStoredLedgerListViewMode(VIEW_MODE_KEY),
  );

  useEffect(() => {
    fetchSuppliers();
  }, [currentPage, limit]);

  // Once this render's rows are actually on screen, restore the scroll position the user
  // was at before they drilled into a supplier's ledger — restoring any earlier has nothing
  // to scroll to yet. No-ops after the first successful restore.
  useEffect(() => {
    if (!loading) restoreScroll();
  }, [loading, restoreScroll]);

  const handleViewModeChange = (mode: LedgerListViewMode) => {
    setViewMode(mode);
    storeLedgerListViewMode(VIEW_MODE_KEY, mode);
  };

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const response = await Axios.get(summery.fetchSuppliersWithBalances.url, {
        params: {
          page: currentPage,
          limit,
          sortBy: 'name:asc'
        }
      });
      setSuppliers(response.data?.results || response.data || []);
      setTotalPages(response.data?.totalPages || 1);
    } catch (error: any) {
      toast.error(t('Failed to load suppliers'));
      console.error('Error fetching suppliers:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    try {
      const data = filteredSuppliers.map(supplier => ({
        'Supplier Name': supplier.name,
        'Phone': supplier.phone || '-',
        'Balance': supplier.balance.toFixed(2),
        'Status': supplier.balance > 0 ? 'Payable' : supplier.balance < 0 ? 'Receivable' : 'Settled',
        'Last Transaction': supplier.lastTransactionDate || '-'
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Suppliers');
      XLSX.writeFile(wb, `supplier-ledger-${getBusinessToday()}.xlsx`);
      toast.success(t('Data exported successfully'));
    } catch (error) {
      console.error('Export error:', error);
      toast.error(t('Failed to export data'));
    }
  };

  const filteredSuppliers = suppliers.filter((supplier) =>
    ledgerRowMatchesSearch(searchTerm, supplier),
  );

  const pagination = {
    totalPage: totalPages,
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
          <CardTitle>{t('Supplier Ledger')}</CardTitle>
          <CardDescription>{t('View all supplier balances and transactions')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="max-sm:px-0">
        <LedgerListToolbar
          searchInput={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder={t('Search suppliers...')}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          actions={
            <div className="flex items-center gap-2 max-sm:grid max-sm:grid-cols-3">
              <Button variant="outline" onClick={() => setBulkSmsOpen(true)} className="shrink-0 max-sm:w-full max-sm:px-2">
                <MessageSquare className="w-4 h-4 mr-2 max-sm:mr-1.5" />
                <span className="max-sm:hidden">{t('Send SMS')}</span>
                <span className="sm:hidden">{t('SMS')}</span>
              </Button>
              <BalanceSheetPrintButton party="supplier" rows={suppliers} disabled={loading} />
              <Button variant="outline" onClick={exportToExcel} className="shrink-0 max-sm:w-full max-sm:px-2">
                <Download className="w-4 h-4 mr-2 max-sm:mr-1.5" />
                <span className="max-sm:hidden">{t('Export to Excel')}</span>
                <span className="sm:hidden">{t('Excel')}</span>
              </Button>
            </div>
          }
        />

        {viewMode === 'cards' ? (
          <SupplierLedgerCardGrid
            suppliers={filteredSuppliers}
            loading={loading}
            onSelectSupplier={onSelectSupplier}
            pagination={pagination}
          />
        ) : (
          <SupplierLedgerTable
            suppliers={filteredSuppliers}
            loading={loading}
            onSelectSupplier={onSelectSupplier}
            pagination={pagination}
          />
        )}
      </CardContent>

      <BulkSmsDialog
        open={bulkSmsOpen}
        onOpenChange={setBulkSmsOpen}
        recipients={filteredSuppliers}
        entityType="supplier"
        branchName={branchName}
      />
    </Card>
  );
}
