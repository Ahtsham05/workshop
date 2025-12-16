import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
// import { Label } from '@/components/ui/label';
import { useLanguage } from '@/context/language-context';
import { Search, Eye, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import Axios from '@/utils/Axios';
import summery from '@/utils/summery';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface SupplierWithBalance {
  _id: string;
  name: string;
  phone?: string;
  balance: number;
  lastTransactionDate?: string;
}

interface SupplierLedgerListProps {
  onSelectSupplier: (supplier: SupplierWithBalance) => void;
}

export function SupplierLedgerList({ onSelectSupplier }: SupplierLedgerListProps) {
  const { t } = useLanguage();
  const [suppliers, setSuppliers] = useState<SupplierWithBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);

  useEffect(() => {
    fetchSuppliers();
  }, [currentPage, pageSize]);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const response = await Axios.get(summery.fetchSuppliersWithBalances.url, {
        params: {
          page: currentPage,
          limit: pageSize,
          sortBy: 'name:asc'
        }
      });
      setSuppliers(response.data?.results || response.data || []);
      setTotalPages(response.data?.totalPages || 1);
      setTotalResults(response.data?.totalResults || response.data?.length || 0);
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

  const filteredSuppliers = suppliers.filter((supplier) => {
    const query = searchTerm.toLowerCase();
    const name = supplier.name?.toLowerCase() || '';
    const phone = supplier.phone?.toLowerCase() || '';
    return name.includes(query) || phone.includes(query);
  });

  const getBalanceColor = (balance: number) => {
    if (balance > 0) return 'text-red-600'; // We owe supplier
    if (balance < 0) return 'text-green-600'; // Supplier owes us
    return 'text-gray-600';
  };

  const formatBalance = (balance: number) => {
    return Math.abs(balance).toFixed(2);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t('Supplier Ledger')}</CardTitle>
            <CardDescription>{t('View all supplier balances and transactions')}</CardDescription>
          </div>
          <Button variant="outline" onClick={exportToExcel}>
            <Download className="w-4 h-4 mr-2" />
            {t('Export to Excel')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder={t('Search suppliers...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          {/* <div className="space-y-2">
            <Select value={pageSize.toString()} onValueChange={(value) => { setPageSize(Number(value)); setCurrentPage(1); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div> */}
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">{t('Loading...')}</div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {searchTerm ? t('No suppliers found') : t('No suppliers available')}
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Supplier Name')}</TableHead>
                  <TableHead>{t('Balance')}</TableHead>
                  <TableHead>{t('Phone')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>{t('Last Transaction')}</TableHead>
                  <TableHead className="text-right">{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSuppliers.map((supplier) => (
                  <TableRow 
                    key={supplier._id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onSelectSupplier(supplier)}
                  >
                    <TableCell className="font-medium">{supplier.name}</TableCell>
                    <TableCell className={getBalanceColor(supplier.balance)}>
                      Rs{formatBalance(supplier.balance)}
                    </TableCell>
                    <TableCell className="text-gray-600 text-sm">{supplier.phone || '-'}</TableCell>
                    <TableCell>
                      {supplier.balance > 0 ? (
                        <Badge variant="destructive">{t('Payable')}</Badge>
                      ) : supplier.balance < 0 ? (
                        <Badge variant="default" className="bg-green-600">{t('Receivable')}</Badge>
                      ) : (
                        <Badge variant="secondary">{t('Settled')}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {supplier.lastTransactionDate
                        ? formatDistanceToNow(new Date(supplier.lastTransactionDate), { addSuffix: true })
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSelectSupplier(supplier)}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        {t('View Details')}
                      </Button>
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
              {t('Showing')} {(currentPage - 1) * pageSize + 1} {t('to')} {Math.min(currentPage * pageSize, totalResults)} {t('of')} {totalResults} {t('suppliers')}
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
  );
}
