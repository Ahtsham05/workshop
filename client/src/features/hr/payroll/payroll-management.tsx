import { useMemo, useState } from 'react';
import { useLanguage } from '@/context/language-context';
import {
  useGetPayrollsQuery,
  useGeneratePayrollMutation,
  useProcessPayrollMutation,
  useUpdatePayrollMutation,
  useUpdateEmployeeLedgerEntryMutation,
  useGetEmployeesQuery,
  useGetEmployeeLedgerEntriesQuery,
  useGetEmployeeLedgerSummaryQuery,
  useCreateEmployeePaymentMutation,
} from '@/stores/hr.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  Play,
  Pencil,
} from 'lucide-react';
import { toast } from 'sonner';

export default function PayrollManagement() {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState(new Date().getMonth() + 1);
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear());
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showLedgerPayDialog, setShowLedgerPayDialog] = useState(false);
  const [showLedgerEditDialog, setShowLedgerEditDialog] = useState(false);
  const [selectedEmployeeLedger, setSelectedEmployeeLedger] = useState('');
  const [selectedLedgerEntry, setSelectedLedgerEntry] = useState<any>(null);
  const [selectedPayroll, setSelectedPayroll] = useState<any>(null);
  const [editPayrollData, setEditPayrollData] = useState({
    basicSalary: '',
    absentDeduction: '',
    advanceDeduction: '',
    leaveDeduction: '',
    notes: '',
  });
  const [ledgerPaymentData, setLedgerPaymentData] = useState({
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [ledgerEditData, setLedgerEditData] = useState({
    transactionDate: new Date().toISOString().split('T')[0],
    reference: '',
    debit: '',
    credit: '',
  });

  const { data, isLoading, refetch } = useGetPayrollsQuery({
    page,
    limit: 10,
    search: search || undefined,
    month: monthFilter,
    year: yearFilter,
  });

  const [generatePayroll, { isLoading: isGenerating }] = useGeneratePayrollMutation();
  const [processPayroll, { isLoading: isProcessing }] = useProcessPayrollMutation();
  const [updatePayroll, { isLoading: isUpdatingPayroll }] = useUpdatePayrollMutation();
  const [updateEmployeeLedgerEntry, { isLoading: isUpdatingLedgerEntry }] = useUpdateEmployeeLedgerEntryMutation();
  const [createEmployeePayment, { isLoading: isPayingEmployee }] = useCreateEmployeePaymentMutation();

  const [generateData, setGenerateData] = useState({
    employee: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  });

  const { data: employeesData } = useGetEmployeesQuery({
    limit: 100,
    employmentStatus: 'Active',
  });
  const { data: employeeLedgerData, refetch: refetchEmployeeLedger } = useGetEmployeeLedgerEntriesQuery(
    {
      employee: selectedEmployeeLedger || undefined,
      limit: 100,
      sortBy: 'transactionDate:asc',
    },
    { skip: !selectedEmployeeLedger }
  );
  const { data: payrollLinkedLedgerData } = useGetEmployeeLedgerEntriesQuery({
    limit: 1000,
    sortBy: 'transactionDate:asc',
  });
  const { data: employeeLedgerSummary, refetch: refetchEmployeeLedgerSummary } = useGetEmployeeLedgerSummaryQuery(
    selectedEmployeeLedger,
    { skip: !selectedEmployeeLedger }
  );

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

  const handleLedgerPay = async () => {
    if (!selectedEmployeeLedger) {
      toast.error(t('Please select employee'));
      return;
    }
    try {
      const result: any = await createEmployeePayment({
        employee: selectedEmployeeLedger,
        amount: Number(ledgerPaymentData.amount),
        transactionDate: ledgerPaymentData.paymentDate,
        paymentMethod: 'Cash',
        notes: ledgerPaymentData.notes || undefined,
      }).unwrap();
      if (Number(result?.extraAdvanceAmount || 0) > 0) {
        toast.success(t('Payment saved. Extra amount posted as advance.'));
      } else {
        toast.success(t('Payment saved'));
      }
      setShowLedgerPayDialog(false);
      setLedgerPaymentData({
        amount: '',
        paymentDate: new Date().toISOString().split('T')[0],
        notes: '',
      });
      refetch();
      refetchEmployeeLedger();
      refetchEmployeeLedgerSummary();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to save payment'));
    }
  };

  const openEditDialog = (payroll: any) => {
    setSelectedPayroll(payroll);
    setEditPayrollData({
      basicSalary: String(Number(payroll.basicSalary || 0)),
      absentDeduction: String(Number(payroll?.deductions?.absent || 0)),
      advanceDeduction: String(Number(payroll?.deductions?.advance || 0)),
      leaveDeduction: String(Number(payroll?.deductions?.other || 0)),
      notes: payroll.notes || '',
    });
    setShowEditDialog(true);
  };

  const handleEditPayroll = async () => {
    if (!selectedPayroll) return;
    try {
      await updatePayroll({
        id: selectedPayroll.id,
        basicSalary: Number(editPayrollData.basicSalary || 0),
        deductions: {
          ...(selectedPayroll.deductions || {}),
          absent: Number(editPayrollData.absentDeduction || 0),
          advance: Number(editPayrollData.advanceDeduction || 0),
          other: Number(editPayrollData.leaveDeduction || 0),
        },
        notes: editPayrollData.notes.trim(),
      }).unwrap();
      toast.success(t('Payroll updated successfully'));
      setShowEditDialog(false);
      setSelectedPayroll(null);
      refetch();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to update payroll'));
    }
  };

  const openLedgerEditDialog = (entry: any) => {
    setSelectedLedgerEntry(entry);
    setLedgerEditData({
      transactionDate: entry?.transactionDate
        ? new Date(entry.transactionDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      reference: String(entry?.reference || ''),
      debit: String(Number(entry?.debit || 0)),
      credit: String(Number(entry?.credit || 0)),
    });
    setShowLedgerEditDialog(true);
  };

  const handleLedgerEntryEdit = async () => {
    if (!selectedLedgerEntry) return;
    try {
      await updateEmployeeLedgerEntry({
        id: selectedLedgerEntry.id,
        transactionDate: ledgerEditData.transactionDate,
        reference: ledgerEditData.reference.trim(),
        debit: Number(ledgerEditData.debit || 0),
        credit: Number(ledgerEditData.credit || 0),
      }).unwrap();
      toast.success(t('Ledger entry updated'));
      setShowLedgerEditDialog(false);
      setSelectedLedgerEntry(null);
      refetchEmployeeLedger();
      refetchEmployeeLedgerSummary();
      refetch();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to update ledger entry'));
    }
  };

  const getPayrollMonthTotals = (payroll: any) => {
    const getEmployeeId = (employeeValue: any) => {
      if (!employeeValue) return '';
      if (typeof employeeValue === 'string') return employeeValue;
      return String(employeeValue.id || employeeValue._id || '');
    };

    const payrollEmployeeId = getEmployeeId(payroll.employee);
    const entries = (payrollLinkedLedgerData?.results || []).filter((entry: any) => {
      const entryDate = new Date(entry.transactionDate);
      const entryMonth = entryDate.getMonth() + 1;
      const entryYear = entryDate.getFullYear();
      return (
        getEmployeeId(entry.employee) === payrollEmployeeId &&
        entryMonth === Number(payroll.month) &&
        entryYear === Number(payroll.year)
      );
    });

    const paid = entries
      .filter((entry: any) => entry.transactionType === 'salary_payment')
      .reduce((sum: number, entry: any) => sum + Number(entry.credit || 0), 0);

    const advance = entries
      .filter((entry: any) => entry.transactionType === 'advance_payment')
      .reduce((sum: number, entry: any) => sum + Number(entry.credit || 0), 0);

    return { paid, advance };
  };

  const dashboardTotals = useMemo(() => {
    const rows = data?.results || [];
    return rows.reduce(
      (acc: any, payroll: any) => {
        const monthTotals = getPayrollMonthTotals(payroll);
        acc.payable += Number(payroll.netSalary || 0);
        acc.paid += Number(monthTotals.paid || 0);
        acc.advance += Number(monthTotals.advance || 0);
        return acc;
      },
      { payable: 0, paid: 0, advance: 0 }
    );
  }, [data?.results, payrollLinkedLedgerData?.results]);

  const sortedLedgerEntries = useMemo(() => {
    const entries = [...(employeeLedgerData?.results || [])];
    return entries.sort((a: any, b: any) => {
      const dateDiff = new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime();
      if (dateDiff !== 0) return dateDiff;
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    });
  }, [employeeLedgerData?.results]);

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
                <p className="text-sm font-medium text-muted-foreground">{t('Total Payable')}</p>
                <p className="text-2xl font-bold text-blue-700">{formatCurrency(dashboardTotals.payable)}</p>
              </div>
              <div className="p-3 rounded-full bg-blue-50">
                <DollarSign className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('Total Paid')}</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(dashboardTotals.paid)}</p>
              </div>
              <div className="p-3 rounded-full bg-green-50">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('Total Advance')}</p>
                <p className="text-2xl font-bold text-orange-600">{formatCurrency(dashboardTotals.advance)}</p>
              </div>
              <div className="p-3 rounded-full bg-orange-50">
                <DollarSign className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('Remaining Payable')}</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(Math.max(0, dashboardTotals.payable - dashboardTotals.paid - dashboardTotals.advance))}
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
                  <TableHead>{t('Payable')}</TableHead>
                  <TableHead>{t('Paid')}</TableHead>
                  <TableHead>{t('Advance')}</TableHead>
                  <TableHead className="text-right">{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      {t('Loading...')}
                    </TableCell>
                  </TableRow>
                ) : data?.results?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {t('No payroll records found')}
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.results?.map((payroll: any) => (
                    (() => {
                      const monthTotals = getPayrollMonthTotals(payroll);
                      return (
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
                          <TableCell className="font-semibold text-green-600">{formatCurrency(monthTotals.paid)}</TableCell>
                          <TableCell className="font-semibold text-orange-600">{formatCurrency(monthTotals.advance)}</TableCell>
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
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEditDialog(payroll)}
                              >
                                <Pencil className="h-4 w-4 mr-1" />
                                {t('Edit')}
                              </Button>
                              <Button size="sm" variant="outline">
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })()
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

      {/* Employee Ledger */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('Employee Ledger')}</CardTitle>
            <Button
              variant="outline"
              onClick={() => setShowLedgerPayDialog(true)}
              disabled={!selectedEmployeeLedger}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('Pay')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-md">
            <Label>{t('Select Employee')}</Label>
            <Select value={selectedEmployeeLedger} onValueChange={setSelectedEmployeeLedger}>
              <SelectTrigger>
                <SelectValue placeholder={t('Select employee to view ledger')} />
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

          {selectedEmployeeLedger && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-blue-50">
                  <p className="text-xs text-muted-foreground">{t('Total Payable')}</p>
                  <p className="font-semibold">{formatCurrency(employeeLedgerSummary?.totalPayable || 0)}</p>
                </div>
                <div className="p-3 rounded-lg bg-green-50">
                  <p className="text-xs text-muted-foreground">{t('Salary Paid')}</p>
                  <p className="font-semibold">{formatCurrency(employeeLedgerSummary?.totalSalaryPaid || 0)}</p>
                </div>
                <div className="p-3 rounded-lg bg-orange-50">
                  <p className="text-xs text-muted-foreground">{t('Advance Paid')}</p>
                  <p className="font-semibold">{formatCurrency(employeeLedgerSummary?.totalAdvancePaid || 0)}</p>
                </div>
                <div className="p-3 rounded-lg bg-red-50">
                  <p className="text-xs text-muted-foreground">{t('Remaining Payable')}</p>
                  <p className="font-semibold">{formatCurrency(employeeLedgerSummary?.remainingPayable || 0)}</p>
                </div>
              </div>

              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('Date')}</TableHead>
                      <TableHead>{t('Reference')}</TableHead>
                      <TableHead>{t('Debit')}</TableHead>
                      <TableHead>{t('Credit')}</TableHead>
                      <TableHead>{t('Balance')}</TableHead>
                      <TableHead className="text-right">{t('Actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(employeeLedgerData?.results || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                          {t('No ledger entries found')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedLedgerEntries.map((entry: any) => {
                        return (
                          <TableRow key={entry.id}>
                            <TableCell>{new Date(entry.transactionDate).toLocaleDateString('en-GB')}</TableCell>
                            <TableCell>{entry.reference || entry.notes || '-'}</TableCell>
                            <TableCell>{formatCurrency(entry.debit || 0)}</TableCell>
                            <TableCell>{formatCurrency(entry.credit || 0)}</TableCell>
                            <TableCell className="font-medium">{formatCurrency(entry.balance || 0)}</TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" onClick={() => openLedgerEditDialog(entry)}>
                                <Pencil className="h-4 w-4 mr-1" />
                                {t('Edit')}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
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

      {/* Ledger Pay Dialog */}
      <Dialog open={showLedgerPayDialog} onOpenChange={setShowLedgerPayDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Pay Employee')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('Amount')}</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={ledgerPaymentData.amount}
                onChange={(e) => setLedgerPaymentData({ ...ledgerPaymentData, amount: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {t('Remaining Payable')}: {formatCurrency(employeeLedgerSummary?.remainingPayable || 0)}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t('Payment Date')}</Label>
              <Input
                type="date"
                value={ledgerPaymentData.paymentDate}
                onChange={(e) => setLedgerPaymentData({ ...ledgerPaymentData, paymentDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('Notes')}</Label>
              <Input
                value={ledgerPaymentData.notes}
                onChange={(e) => setLedgerPaymentData({ ...ledgerPaymentData, notes: e.target.value })}
                placeholder={t('Optional notes')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLedgerPayDialog(false)}>
              {t('Cancel')}
            </Button>
            <Button onClick={handleLedgerPay} disabled={isPayingEmployee || !ledgerPaymentData.amount}>
              {isPayingEmployee ? t('Processing...') : t('Pay')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ledger Edit Dialog */}
      <Dialog open={showLedgerEditDialog} onOpenChange={setShowLedgerEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Edit Ledger Entry')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('Date')}</Label>
              <Input
                type="date"
                value={ledgerEditData.transactionDate}
                onChange={(e) => setLedgerEditData({ ...ledgerEditData, transactionDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('Reference')}</Label>
              <Input
                value={ledgerEditData.reference}
                onChange={(e) => setLedgerEditData({ ...ledgerEditData, reference: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('Debit')}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={ledgerEditData.debit}
                  onChange={(e) => setLedgerEditData({ ...ledgerEditData, debit: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('Credit')}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={ledgerEditData.credit}
                  onChange={(e) => setLedgerEditData({ ...ledgerEditData, credit: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLedgerEditDialog(false)}>
              {t('Cancel')}
            </Button>
            <Button onClick={handleLedgerEntryEdit} disabled={isUpdatingLedgerEntry}>
              {isUpdatingLedgerEntry ? t('Saving...') : t('Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Payroll Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Edit Payroll')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('Basic Salary')}</Label>
              <Input
                type="number"
                min="0"
                value={editPayrollData.basicSalary}
                onChange={(e) => setEditPayrollData({ ...editPayrollData, basicSalary: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>{t('Absent Deduction')}</Label>
                <Input
                  type="number"
                  min="0"
                  value={editPayrollData.absentDeduction}
                  onChange={(e) => setEditPayrollData({ ...editPayrollData, absentDeduction: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('Leave Deduction')}</Label>
                <Input
                  type="number"
                  min="0"
                  value={editPayrollData.leaveDeduction}
                  onChange={(e) => setEditPayrollData({ ...editPayrollData, leaveDeduction: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('Advance Deduction')}</Label>
                <Input
                  type="number"
                  min="0"
                  value={editPayrollData.advanceDeduction}
                  onChange={(e) => setEditPayrollData({ ...editPayrollData, advanceDeduction: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('Notes')}</Label>
              <Input
                value={editPayrollData.notes}
                onChange={(e) => setEditPayrollData({ ...editPayrollData, notes: e.target.value })}
                placeholder={t('Optional notes')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              {t('Cancel')}
            </Button>
            <Button onClick={handleEditPayroll} disabled={isUpdatingPayroll}>
              {isUpdatingPayroll ? t('Saving...') : t('Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
