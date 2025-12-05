import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// import { Label } from '@/components/ui/label';
import { useLanguage } from '@/context/language-context';
import { Search, Eye, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import Axios from '@/utils/Axios';
import summery from '@/utils/summery';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface CustomerWithBalance {
  _id: string;
  name: string;
  phone?: string;
  balance: number;
  lastTransactionDate?: string;
}

interface CustomerLedgerListProps {
  onSelectCustomer: (customer: CustomerWithBalance) => void;
}

export function CustomerLedgerList({ onSelectCustomer }: CustomerLedgerListProps) {
  const { t } = useLanguage();
  const [customers, setCustomers] = useState<CustomerWithBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);

  useEffect(() => {
    fetchCustomers();
  }, [currentPage, pageSize]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const response = await Axios.get(summery.fetchCustomersWithBalances.url, {
        params: {
          page: currentPage,
          limit: pageSize,
          sortBy: 'name:asc'
        }
      });
      setCustomers(response.data?.results || response.data || []);
      setTotalPages(response.data?.totalPages || 1);
      setTotalResults(response.data?.totalResults || response.data?.length || 0);
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

  const filteredCustomers = customers.filter((customer) => {
    const query = searchTerm.toLowerCase();
    const name = customer.name?.toLowerCase() || '';
    const phone = customer.phone?.toLowerCase() || '';
    return name.includes(query) || phone.includes(query);
  });

  const getBalanceColor = (balance: number) => {
    if (balance > 0) return 'text-red-600'; // Customer owes us
    if (balance < 0) return 'text-green-600'; // We owe customer
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
            <CardTitle>{t('Customer Ledger')}</CardTitle>
            <CardDescription>{t('View all customer balances and transactions')}</CardDescription>
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
              placeholder={t('Search customers...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="space-y-2">
            {/* <Label>{t('Records per page')}</Label> */}
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
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">{t('Loading...')}</div>
        ) : filteredCustomers.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {searchTerm ? t('No customers found') : t('No customers available')}
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Customer Name')}</TableHead>
                  <TableHead>{t('Phone')}</TableHead>
                  <TableHead>{t('Balance')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>{t('Last Transaction')}</TableHead>
                  <TableHead className="text-right">{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer) => (
                  <TableRow 
                    key={customer._id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onSelectCustomer(customer)}
                  >
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell className="text-gray-600 text-sm">{customer.phone || '-'}</TableCell>
                    <TableCell className={getBalanceColor(customer.balance)}>
                      Rs{formatBalance(customer.balance)}
                    </TableCell>
                    <TableCell>
                      {customer.balance > 0 ? (
                        <Badge variant="destructive">{t('Receivable')}</Badge>
                      ) : customer.balance < 0 ? (
                        <Badge variant="default" className="bg-green-600">{t('Payable')}</Badge>
                      ) : (
                        <Badge variant="secondary">{t('Settled')}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {customer.lastTransactionDate
                        ? formatDistanceToNow(new Date(customer.lastTransactionDate), { addSuffix: true })
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSelectCustomer(customer)}
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
              {t('Showing')} {(currentPage - 1) * pageSize + 1} {t('to')} {Math.min(currentPage * pageSize, totalResults)} {t('of')} {totalResults} {t('customers')}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                {t('First')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                {t('Previous')}
              </Button>
              <div className="flex items-center gap-2 px-3">
                <span className="text-sm text-gray-600">
                  {t('Page')} {currentPage} {t('of')} {totalPages}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                {t('Next')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                {t('Last')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
