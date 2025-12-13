import { useState } from 'react';
import { useLanguage } from '@/context/language-context';
import {
  useGetPayrollsQuery,
  useGeneratePayrollMutation,
  useProcessPayrollMutation,
  useMarkPayrollPaidMutation,
  useGetEmployeesQuery,
} from '@/stores/hr.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DollarSign,
  Plus,
  FileText,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Play,
} from 'lucide-react';
import { toast } from 'sonner';

export default function PayrollManagement() {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [monthFilter, setMonthFilter] = useState(new Date().getMonth() + 1);
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear());
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showMarkPaidDialog, setShowMarkPaidDialog] = useState(false);
  const [selectedPayrollId, setSelectedPayrollId] = useState('');
  const [paymentData, setPaymentData] = useState({
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'Bank Transfer',
  });

  const { data, isLoading, refetch } = useGetPayrollsQuery({
    page,
    limit: 10,
    search: search || undefined,
    status: statusFilter || undefined,
    month: monthFilter,
    year: yearFilter,
  });

  const [generatePayroll, { isLoading: isGenerating }] = useGeneratePayrollMutation();
  const [processPayroll, { isLoading: isProcessing }] = useProcessPayrollMutation();
  const [markPaid, { isLoading: isMarkingPaid }] = useMarkPayrollPaidMutation();

  const [generateData, setGenerateData] = useState({
    employee: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  });

  const { data: employeesData } = useGetEmployeesQuery({
    limit: 100,
    employmentStatus: 'Active',
  });

  const handleGenerate = async () => {
    try {
      await generatePayroll(generateData).unwrap();
      toast.success(t('Payroll generated successfully'));
      setShowGenerateDialog(false);
      setGenerateData({
        employee: '',
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
      });
      refetch();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to generate payroll'));
    }
  };

  const handleProcess = async (payrollId: string) => {
    try {
      await processPayroll({ id: payrollId }).unwrap();
      toast.success(t('Payroll processed'));
      refetch();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to process payroll'));
    }
  };

  const handleMarkPaid = async () => {
    try {
      await markPaid({ 
        id: selectedPayrollId,
        ...paymentData 
      }).unwrap();
      toast.success(t('Payroll marked as paid'));
      setShowMarkPaidDialog(false);
      setPaymentData({
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'Bank Transfer',
      });
      refetch();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to mark as paid'));
    }
  };

  const openMarkPaidDialog = (payrollId: string) => {
    setSelectedPayrollId(payrollId);
    setShowMarkPaidDialog(true);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      Pending: { className: 'bg-yellow-100 text-yellow-700' },
      Processed: { className: 'bg-blue-100 text-blue-700' },
      Paid: { className: 'bg-green-100 text-green-700' },
      Failed: { className: 'bg-red-100 text-red-700' },
    };
    return variants[status] || variants.Pending;
  };

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
    }).format(amount);
  };

  return (
    <div className="h-full w-full p-4 space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('Pending')}</p>
                <p className="text-3xl font-bold text-yellow-600">
                  {data?.results?.filter((p: any) => p.status === 'Pending').length || 0}
                </p>
              </div>
              <div className="p-3 rounded-full bg-yellow-50">
                <FileText className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('Processed')}</p>
                <p className="text-3xl font-bold text-blue-600">
                  {data?.results?.filter((p: any) => p.status === 'Processed').length || 0}
                </p>
              </div>
              <div className="p-3 rounded-full bg-blue-50">
                <Play className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('Paid')}</p>
                <p className="text-3xl font-bold text-green-600">
                  {data?.results?.filter((p: any) => p.status === 'Paid').length || 0}
                </p>
              </div>
              <div className="p-3 rounded-full bg-green-50">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('Total Amount')}</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(
                    data?.results?.reduce((sum: number, p: any) => sum + (p.netSalary || 0), 0) || 0
                  )}
                </p>
              </div>
              <div className="p-3 rounded-full bg-purple-50">
                <DollarSign className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payroll List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('Payroll Records')}</CardTitle>
            <Button onClick={() => setShowGenerateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('Generate Payroll')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('Search employees...')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-10"
              />
            </div>
            <Select
              value={monthFilter.toString()}
              onValueChange={(value) => {
                setMonthFilter(Number(value));
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((month, index) => (
                  <SelectItem key={month} value={(index + 1).toString()}>
                    {t(month)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={yearFilter.toString()}
              onValueChange={(value) => {
                setYearFilter(Number(value));
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value === 'all' ? '' : value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder={t('All Status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('All Status')}</SelectItem>
                <SelectItem value="Pending">{t('Pending')}</SelectItem>
                <SelectItem value="Processed">{t('Processed')}</SelectItem>
                <SelectItem value="Paid">{t('Paid')}</SelectItem>
                <SelectItem value="Failed">{t('Failed')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Employee')}</TableHead>
                  <TableHead>{t('Month/Year')}</TableHead>
                  <TableHead>{t('Gross Salary')}</TableHead>
                  <TableHead>{t('Deductions')}</TableHead>
                  <TableHead>{t('Net Salary')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead className="text-right">{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      {t('Loading...')}
                    </TableCell>
                  </TableRow>
                ) : data?.results?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {t('No payroll records found')}
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.results?.map((payroll: any) => (
                    <TableRow key={payroll.id}>
                      <TableCell className="font-medium">
                        {payroll.employee?.firstName} {payroll.employee?.lastName}
                      </TableCell>
                      <TableCell>
                        {months[payroll.month - 1]} {payroll.year}
                      </TableCell>
                      <TableCell>{formatCurrency(payroll.grossSalary)}</TableCell>
                      <TableCell className="text-red-600">
                        {formatCurrency(payroll.totalDeductions)}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatCurrency(payroll.netSalary)}
                      </TableCell>
                      <TableCell>
                        <Badge {...getStatusBadge(payroll.status)}>{payroll.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {payroll.status === 'Pending' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleProcess(payroll.id)}
                              disabled={isProcessing}
                            >
                              <Play className="h-4 w-4 mr-1" />
                              {t('Process')}
                            </Button>
                          )}
                          {payroll.status === 'Processed' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openMarkPaidDialog(payroll.id)}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              {t('Mark Paid')}
                            </Button>
                          )}
                          <Button size="sm" variant="outline">
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                {t('Showing')} {((page - 1) * 10) + 1} {t('to')} {Math.min(page * 10, data.totalResults)} {t('of')} {data.totalResults} {t('records')}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  {t('Page')} {page} {t('of')} {data.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                  disabled={page === data.totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate Payroll Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Generate Payroll')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('Employee')}</Label>
              <Select
                value={generateData.employee}
                onValueChange={(value) =>
                  setGenerateData({ ...generateData, employee: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('Select employee')} />
                </SelectTrigger>
                <SelectContent>
                  {employeesData?.results?.map((emp: any) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.employeeId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('Month')}</Label>
              <Select
                value={generateData.month.toString()}
                onValueChange={(value) =>
                  setGenerateData({ ...generateData, month: Number(value) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month, index) => (
                    <SelectItem key={month} value={(index + 1).toString()}>
                      {t(month)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('Year')}</Label>
              <Select
                value={generateData.year.toString()}
                onValueChange={(value) =>
                  setGenerateData({ ...generateData, year: Number(value) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-sm text-muted-foreground">
              {t('This will generate payroll for the selected employee based on their attendance and leave records.')}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>
              {t('Cancel')}
            </Button>
            <Button onClick={handleGenerate} disabled={isGenerating || !generateData.employee}>
              {isGenerating ? t('Generating...') : t('Generate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Paid Dialog */}
      <Dialog open={showMarkPaidDialog} onOpenChange={setShowMarkPaidDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Mark Payroll as Paid')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('Payment Date')}</Label>
              <Input
                type="date"
                value={paymentData.paymentDate}
                onChange={(e) =>
                  setPaymentData({ ...paymentData, paymentDate: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>{t('Payment Method')}</Label>
              <Select
                value={paymentData.paymentMethod}
                onValueChange={(value) =>
                  setPaymentData({ ...paymentData, paymentMethod: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">{t('Cash')}</SelectItem>
                  <SelectItem value="Bank Transfer">{t('Bank Transfer')}</SelectItem>
                  <SelectItem value="Cheque">{t('Cheque')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMarkPaidDialog(false)}>
              {t('Cancel')}
            </Button>
            <Button onClick={handleMarkPaid} disabled={isMarkingPaid}>
              {isMarkingPaid ? t('Processing...') : t('Mark as Paid')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
