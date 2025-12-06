import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/context/language-context';
import { ArrowLeft, Plus, Edit, Trash2, Download, Receipt } from 'lucide-react';
import * as XLSX from 'xlsx';
import Axios from '@/utils/Axios';
import summery from '@/utils/summery';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { LedgerEntryForm } from './ledger-entry-form';
import { useGetInvoiceByIdQuery } from '@/stores/invoice.api';
import { PaymentReceipt } from './payment-receipt';

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

// Invoice dialog content component
function InvoiceDialogContent({ invoiceId, customerName }: { invoiceId?: string; customerName: string }) {
  const { t } = useLanguage();
  
  if (!invoiceId) {
    return <div className="text-center py-8 text-gray-500">{t('No invoice selected')}</div>;
  }

  const { data: invoiceData, isLoading, error } = useGetInvoiceByIdQuery(invoiceId);

  if (isLoading) {
    return <div className="text-center py-8 text-gray-500">{t('Loading...')}</div>;
  }

  if (error || !invoiceData) {
    return <div className="text-center py-8 text-red-500">{t('Failed to load invoice details')}</div>;
  }

  const formatDate = (date: any) => {
    try {
      if (!date) return '-';
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) return '-';
      return format(dateObj, 'MMM dd, yyyy');
    } catch {
      return '-';
    }
  };

  const formatCurrency = (amount: any) => {
    const num = Number(amount);
    return isNaN(num) ? '0.00' : num.toFixed(2);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-gray-500">{t('Invoice Number')}</p>
          <p className="font-medium">{invoiceData.invoiceNumber || '-'}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">{t('Date')}</p>
          <p className="font-medium">{formatDate(invoiceData.invoiceDate || invoiceData.date)}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">{t('Customer')}</p>
          <p className="font-medium">{invoiceData.customer?.name || customerName}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">{t('Total Amount')}</p>
          <p className="font-medium text-lg">Rs{formatCurrency(invoiceData.total || invoiceData.totalAmount)}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">{t('Status')}</p>
          <Badge>{invoiceData.status || 'N/A'}</Badge>
        </div>
        <div>
          <p className="text-sm text-gray-500">{t('Type')}</p>
          <Badge variant="outline">{invoiceData.type || 'N/A'}</Badge>
        </div>
      </div>
      <div>
        <p className="text-sm text-gray-500 mb-2">{t('Items')}</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Product')}</TableHead>
              <TableHead>{t('Quantity')}</TableHead>
              <TableHead>{t('Price')}</TableHead>
              <TableHead className="text-right">{t('Total')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoiceData.items && invoiceData.items.length > 0 ? (
              invoiceData.items.map((item: any, index: number) => (
                <TableRow key={index}>
                  <TableCell>{item.name || item.product?.name || item.productName || '-'}</TableCell>
                  <TableCell>{item.quantity || 0}</TableCell>
                  <TableCell>Rs{formatCurrency(item.unitPrice || item.price)}</TableCell>
                  <TableCell className="text-right">Rs{formatCurrency(item.subtotal || item.total)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-gray-500">{t('No items')}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function CustomerLedgerDetails({ customer, onBack }: CustomerLedgerDetailsProps) {
  const { t } = useLanguage();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [viewingInvoice, setViewingInvoice] = useState<any>(null);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);

  useEffect(() => {
    fetchLedgerEntries();
    fetchCustomerBalance();
  }, [customer._id, currentPage, pageSize]);

  const fetchLedgerEntries = async () => {
    try {
      setLoading(true);
      const response = await Axios.get(summery.fetchCustomerLedgerEntries.url, {
        params: { 
          customer: customer._id, 
          sortBy: 'transactionDate:asc',
          page: currentPage,
          limit: pageSize
        },
      });
      setEntries(response.data.results || []);
      setTotalPages(response.data.totalPages || 1);
      setTotalResults(response.data.totalResults || 0);
    } catch (error: any) {
      toast.error(t('Failed to load ledger entries'));
      console.error('Error fetching ledger entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    try {
      const data = entries.map(entry => ({
        'Date': format(new Date(entry.transactionDate), 'MMM dd, yyyy'),
        'Type': getTransactionTypeLabel(entry.transactionType),
        'Description': entry.description,
        'Reference': entry.reference || '-',
        'Debit': entry.debit > 0 ? entry.debit.toFixed(2) : '-',
        'Credit': entry.credit > 0 ? entry.credit.toFixed(2) : '-',
        'Balance': entry.balance.toFixed(2)
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Ledger');
      XLSX.writeFile(wb, `${customer.name}-ledger-${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success(t('Data exported successfully'));
    } catch (error) {
      console.error('Export error:', error);
      toast.error(t('Failed to export data'));
    }
  };

  const fetchCustomerBalance = async () => {
    try {
      setBalanceLoading(true);
      const url = `${summery.fetchCustomerBalance.url}/${customer._id}${summery.fetchCustomerBalance.urlSuffix || ''}`;
      const response = await Axios.get(url);
      setCurrentBalance(response.data.balance || 0);
    } catch (error: any) {
      console.error('Failed to fetch customer balance:', error);
      setCurrentBalance(customer.balance || 0);
    } finally {
      setBalanceLoading(false);
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

  const handleViewInvoice = (referenceId: string) => {
    setViewingInvoice({ id: referenceId });
    setInvoiceDialogOpen(true);
  };

  const handleGenerateReceipt = (entry: LedgerEntry) => {
    // Find the previous balance from the entry before this one
    const entryIndex = entries.findIndex(e => (e.id || e._id) === (entry.id || entry._id));
    const previousBalance = entryIndex > 0 ? entries[entryIndex - 1].balance : entry.balance - entry.credit + entry.debit;
    
    setSelectedPayment({
      entry,
      previousBalance,
      currentBalance: entry.balance,
    });
    setReceiptDialogOpen(true);
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
        <div className="flex gap-2 items-center">
          <div className="flex items-center gap-2">
            <Label className="text-sm">{t('Show')}</Label>
            <Select value={pageSize.toString()} onValueChange={(value) => { setPageSize(Number(value)); setCurrentPage(1); }}>
              <SelectTrigger className="w-20">
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
          <Button variant="outline" size="sm" onClick={exportToExcel}>
            <Download className="w-4 h-4 mr-2" />
            {t('Export')}
          </Button>
          <Button onClick={() => setShowEntryForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {t('Add Entry')}
          </Button>
        </div>
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
              onSuccess={(createdEntry) => {
                handleCloseForm();
                fetchLedgerEntries();
                fetchCustomerBalance();
                
                // Auto-generate receipt for payment received
                if (createdEntry && createdEntry.transactionType === 'payment_received') {
                  setTimeout(() => {
                    const previousBalance = currentBalance || 0;
                    const newBalance = previousBalance - createdEntry.credit;
                    
                    setSelectedPayment({
                      entry: createdEntry,
                      previousBalance: previousBalance,
                      currentBalance: newBalance,
                    });
                    setReceiptDialogOpen(true);
                  }, 500);
                }
              }}
              onCancel={handleCloseForm}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('Invoice Details')}</DialogTitle>
          </DialogHeader>
          <InvoiceDialogContent invoiceId={viewingInvoice?.id} customerName={customer.name} />
        </DialogContent>
      </Dialog>

      <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('Payment Receipt')}</DialogTitle>
          </DialogHeader>
          {selectedPayment && (
            <PaymentReceipt
              customer={{
                name: customer.name,
                phone: customer.phone,
                address: customer.address,
              }}
              payment={{
                amount: selectedPayment.entry.credit,
                date: selectedPayment.entry.transactionDate,
                reference: selectedPayment.entry.reference,
                paymentMethod: selectedPayment.entry.paymentMethod,
                description: selectedPayment.entry.description,
              }}
              balance={{
                previousBalance: selectedPayment.previousBalance,
                currentBalance: selectedPayment.currentBalance,
              }}
              receiptNumber={selectedPayment.entry.reference || `RCP-${format(new Date(selectedPayment.entry.transactionDate), 'yyyyMMdd')}-${(selectedPayment.entry.id || selectedPayment.entry._id)?.slice(-6)}`}
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
            {balanceLoading ? (
              <div className="text-2xl font-bold text-gray-400">{t('Loading...')}</div>
            ) : currentBalance !== null ? (
              <div className={`text-3xl font-bold ${getBalanceColor(currentBalance)}`}>
                Rs{Math.abs(currentBalance).toFixed(2)}
                {currentBalance > 0 && (
                  <span className="text-sm text-red-600 ml-2">({t('Receivable')})</span>
                )}
                {currentBalance < 0 && (
                  <span className="text-sm text-green-600 ml-2">({t('Payable')})</span>
                )}
              </div>
            ) : (
              <div className="text-2xl font-bold text-gray-600">Rs0.00</div>
            )}
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-500">{t('Loading...')}</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-gray-500">{t('No transactions found')}</div>
          ) : (
            <>
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
                          {entry.referenceId ? (
                            <Button
                              variant="link"
                              className="p-0 h-auto font-normal text-blue-600 hover:text-blue-800"
                              onClick={() => handleViewInvoice(entry.referenceId!)}
                            >
                              {entry.reference || entry.referenceId}
                            </Button>
                          ) : (
                            entry.reference || '-'
                          )}
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
                            {entry.transactionType === 'payment_received' && entry.credit > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleGenerateReceipt(entry)}
                                className="h-8 w-8 p-0"
                                title={t('Generate Receipt')}
                              >
                                <Receipt className="w-4 h-4 text-blue-600" />
                              </Button>
                            )}
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

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-gray-600">
                    {t('Showing')} {(currentPage - 1) * pageSize + 1} {t('to')} {Math.min(currentPage * pageSize, totalResults)} {t('of')} {totalResults} {t('entries')}
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
