import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/context/language-context';
import { Search, Eye } from 'lucide-react';
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

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const response = await Axios.get(summery.fetchCustomersWithBalances.url);
      setCustomers(response.data || []);
    } catch (error: any) {
      toast.error(t('Failed to load customers'));
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
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
        <CardTitle>{t('Customer Ledger')}</CardTitle>
        <CardDescription>{t('View all customer balances and transactions')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
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
                  <TableRow key={customer._id}>
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
      </CardContent>
    </Card>
  );
}
