import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/context/language-context';
import { Download } from 'lucide-react';
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
import {
  getStoredLedgerListViewMode,
  storeLedgerListViewMode,
  type LedgerListViewMode,
} from '../utils/ledger-list-view';

const VIEW_MODE_KEY = 'customer-ledger-list-view';

interface CustomerLedgerListProps {
  onSelectCustomer: (customer: CustomerWithBalance) => void;
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

export function CustomerLedgerList({ onSelectCustomer }: CustomerLedgerListProps) {
  const { t } = useLanguage();
  const [customers, setCustomers] = useState<CustomerWithBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [viewMode, setViewMode] = useState<LedgerListViewMode>(() =>
    getStoredLedgerListViewMode(VIEW_MODE_KEY),
  );

  useEffect(() => {
    fetchCustomers();
  }, [currentPage, limit]);

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

  const filteredCustomers = customers.filter((customer) =>
    ledgerRowMatchesSearch(searchTerm, customer),
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
          <CardTitle>{t('Customer Ledger')}</CardTitle>
          <CardDescription>{t('View all customer balances and transactions')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <LedgerListToolbar
          searchInput={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder={t('Search customers...')}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          actions={
            <Button variant="outline" onClick={exportToExcel} className="shrink-0">
              <Download className="w-4 h-4 mr-2" />
              {t('Export to Excel')}
            </Button>
          }
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
    </Card>
  );
}
