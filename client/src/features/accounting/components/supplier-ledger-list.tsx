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
import {
  getStoredLedgerListViewMode,
  storeLedgerListViewMode,
  type LedgerListViewMode,
} from '../utils/ledger-list-view';

const VIEW_MODE_KEY = 'supplier-ledger-list-view';

interface SupplierLedgerListProps {
  onSelectSupplier: (supplier: SupplierWithBalance) => void;
}

function ledgerRowMatchesSearch(
  term: string,
  row: { name?: string; nameUrdu?: string; phone?: string },
): boolean {
  const q = term.trim();
  if (!q) return true;
  const lower = q.toLowerCase();
  const name = row.name ?? '';
  const phone = (row.phone ?? '').toLowerCase();
  const urdu = row.nameUrdu ?? '';
  return (
    name.toLowerCase().includes(lower) ||
    phone.includes(lower) ||
    urdu.includes(q) ||
    urdu.toLowerCase().includes(lower)
  );
}

export function SupplierLedgerList({ onSelectSupplier }: SupplierLedgerListProps) {
  const { t } = useLanguage();
  const [suppliers, setSuppliers] = useState<SupplierWithBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [bulkSmsOpen, setBulkSmsOpen] = useState(false);
  const branchName = useBranchName();
  const [viewMode, setViewMode] = useState<LedgerListViewMode>(() =>
    getStoredLedgerListViewMode(VIEW_MODE_KEY),
  );

  useEffect(() => {
    fetchSuppliers();
  }, [currentPage, limit]);

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
      XLSX.writeFile(wb, `supplier-ledger-${new Date().toISOString().split('T')[0]}.xlsx`);
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
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{t('Supplier Ledger')}</CardTitle>
          <CardDescription>{t('View all supplier balances and transactions')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <LedgerListToolbar
          searchInput={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder={t('Search suppliers...')}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setBulkSmsOpen(true)} className="shrink-0">
                <MessageSquare className="w-4 h-4 mr-2" />
                {t('Send SMS')}
              </Button>
              <Button variant="outline" onClick={exportToExcel} className="shrink-0">
                <Download className="w-4 h-4 mr-2" />
                {t('Export to Excel')}
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
