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

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const response = await Axios.get(summery.fetchSuppliersWithBalances.url);
      setSuppliers(response.data || []);
    } catch (error: any) {
      toast.error(t('Failed to load suppliers'));
      console.error('Error fetching suppliers:', error);
    } finally {
      setLoading(false);
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
        <CardTitle>{t('Supplier Ledger')}</CardTitle>
        <CardDescription>{t('View all supplier balances and transactions')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
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
                  <TableHead>{t('Phone')}</TableHead>
                  <TableHead>{t('Balance')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>{t('Last Transaction')}</TableHead>
                  <TableHead className="text-right">{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSuppliers.map((supplier) => (
                  <TableRow key={supplier._id}>
                    <TableCell className="font-medium">{supplier.name}</TableCell>
                    <TableCell className="text-gray-600 text-sm">{supplier.phone || '-'}</TableCell>
                    <TableCell className={getBalanceColor(supplier.balance)}>
                      Rs{formatBalance(supplier.balance)}
                    </TableCell>
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
      </CardContent>
    </Card>
  );
}
