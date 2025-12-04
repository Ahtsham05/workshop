import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useLanguage } from '@/context/language-context';
import { ArrowLeft, Plus, Edit, Trash2 } from 'lucide-react';
import Axios from '@/utils/Axios';
import summery from '@/utils/summery';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { LedgerEntryForm } from './ledger-entry-form';

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
}

interface CustomerLedgerDetailsProps {
  customer: any;
  onBack: () => void;
}

export function CustomerLedgerDetails({ customer, onBack }: CustomerLedgerDetailsProps) {
  const { t } = useLanguage();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [currentBalance, setCurrentBalance] = useState(customer.balance);

  useEffect(() => {
    fetchLedgerEntries();
    fetchCustomerBalance();
  }, [customer._id]);

  const fetchLedgerEntries = async () => {
    try {
      setLoading(true);
      const response = await Axios.get(summery.fetchCustomerLedgerEntries.url, {
        params: { customer: customer._id, sortBy: 'transactionDate:asc' },
      });
      setEntries(response.data.results || []);
    } catch (error: any) {
      toast.error(t('Failed to load ledger entries'));
      console.error('Error fetching ledger entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerBalance = async () => {
    try {
      const url = `${summery.fetchCustomerBalance.url}/${customer._id}${summery.fetchCustomerBalance.urlSuffix || ''}`;
      const response = await Axios.get(url);
      setCurrentBalance(response.data.balance || 0);
    } catch (error: any) {
      console.error('Failed to fetch customer balance:', error);
    }
  };

  const handleEditEntry = (entry: LedgerEntry) => {
    setEditingEntry(entry);
    setShowEntryForm(true);
  };

  const handleCloseForm = () => {
    setShowEntryForm(false);
    setEditingEntry(null);
  };

  const handleDeleteEntry = async (entry: LedgerEntry) => {
    if (!confirm(t('Are you sure you want to delete this entry? This action cannot be undone.'))) {
      return;
    }

    try {
      const entryId = entry.id || entry._id;
      await Axios.delete(`${summery.deleteCustomerLedgerEntry.url}/${entryId}`);
      toast.success(t('Ledger entry deleted successfully'));
      fetchLedgerEntries();
      fetchCustomerBalance();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('Failed to delete ledger entry'));
      console.error('Error deleting ledger entry:', error);
    }
  };

  // Check if entry is manually created (not from invoice)
  const isManualEntry = (entry: LedgerEntry) => {
    return !entry.referenceId;
  };

  const getTransactionTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      sale: t('Sale'),
      payment_received: t('Payment Received'),
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
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('Back to Customers')}
        </Button>
        <Button onClick={() => setShowEntryForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          {t('Add Entry')}
        </Button>
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
              ledgerType="customer"
              entityId={customer._id}
              entityName={customer.name}
              editingEntry={editingEntry}
              onSuccess={() => {
                handleCloseForm();
                fetchLedgerEntries();
                fetchCustomerBalance();
              }}
              onCancel={handleCloseForm}
            />
          )}
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>{customer.name}</CardTitle>
          <CardDescription>{t('Transaction History and Balance')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">{t('Current Balance')}</div>
            <div className={`text-3xl font-bold ${getBalanceColor(currentBalance)}`}>
              Rs{Math.abs(currentBalance).toFixed(2)}
              {currentBalance > 0 && (
                <span className="text-sm text-red-600 ml-2">({t('Receivable')})</span>
              )}
              {currentBalance < 0 && (
                <span className="text-sm text-green-600 ml-2">({t('Payable')})</span>
              )}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-500">{t('Loading...')}</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-gray-500">{t('No transactions found')}</div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Date')}</TableHead>
                    <TableHead>{t('Type')}</TableHead>
                    <TableHead>{t('Description')}</TableHead>
                    <TableHead>{t('Reference')}</TableHead>
                    <TableHead className="text-right">{t('Debit')}</TableHead>
                    <TableHead className="text-right">{t('Credit')}</TableHead>
                    <TableHead className="text-right">{t('Balance')}</TableHead>
                    <TableHead className="text-right">{t('Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id || entry._id}>
                      <TableCell className="text-sm">
                        {format(new Date(entry.transactionDate), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getTransactionTypeBadge(entry.transactionType)}>
                          {getTransactionTypeLabel(entry.transactionType)}
                        </Badge>
                      </TableCell>
                      <TableCell>{entry.description}</TableCell>
                      <TableCell className="text-gray-500 text-sm">
                        {entry.reference || '-'}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        {entry.debit > 0 ? `Rs${entry.debit.toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        {entry.credit > 0 ? `Rs${entry.credit.toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell className={`text-right ${getBalanceColor(entry.balance)}`}>
                        Rs{Math.abs(entry.balance).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {entry.transactionType === 'payment_received' && isManualEntry(entry) && (
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
