import { useMemo, useState } from 'react';
import { useLanguage } from '@/context/language-context';
import {
  useGetPayrollsQuery,
  useGeneratePayrollMutation,
  useUpdatePayrollMutation,
  useUpdateEmployeeLedgerEntryMutation,
  useDeleteEmployeeLedgerEntryMutation,
  useGetEmployeesQuery,
  useGetEmployeeLedgerEntriesQuery,
  useGetEmployeeLedgerSummaryQuery,
  useCreateEmployeePaymentMutation,
  useCreateEmployeeAdvancePaymentMutation,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DollarSign,
  Plus,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { EmployeePayrollMonthlySummary } from './employee-payroll-monthly';

const toLocalDateInputValue = (value = new Date()) => {
  const d = value instanceof Date ? value : new Date(value);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function PayrollManagement() {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState(new Date().getMonth() + 1);
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear());
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showLedgerPayDialog, setShowLedgerPayDialog] = useState(false);
  const [showLedgerAdvanceDialog, setShowLedgerAdvanceDialog] = useState(false);
  const [showLedgerRecoverDialog, setShowLedgerRecoverDialog] = useState(false);
  const [showLedgerEditDialog, setShowLedgerEditDialog] = useState(false);
  const [showLedgerDeleteDialog, setShowLedgerDeleteDialog] = useState(false);
  const [selectedEmployeeLedger, setSelectedEmployeeLedger] = useState('');
  const [summaryYear, setSummaryYear] = useState(new Date().getFullYear());
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
    advanceRecovery: '',
    paymentDate: toLocalDateInputValue(),
    notes: '',
  });
  const [ledgerAdvanceData, setLedgerAdvanceData] = useState({
    amount: '',
    paymentDate: toLocalDateInputValue(),
    notes: '',
  });
  const [ledgerRecoverData, setLedgerRecoverData] = useState({
    amount: '',
    paymentDate: toLocalDateInputValue(),
    notes: '',
  });
  const [ledgerEditData, setLedgerEditData] = useState({
    transactionDate: toLocalDateInputValue(),
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
  const [updatePayroll, { isLoading: isUpdatingPayroll }] = useUpdatePayrollMutation();
  const [updateEmployeeLedgerEntry, { isLoading: isUpdatingLedgerEntry }] = useUpdateEmployeeLedgerEntryMutation();
  const [deleteEmployeeLedgerEntry, { isLoading: isDeletingLedgerEntry }] = useDeleteEmployeeLedgerEntryMutation();
  const [createEmployeePayment, { isLoading: isPayingEmployee }] = useCreateEmployeePaymentMutation();
  const [createEmployeeAdvancePayment, { isLoading: isCreatingAdvance }] = useCreateEmployeeAdvancePaymentMutation();

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

  const handleLedgerPay = async () => {
    if (!selectedEmployeeLedger) {
      toast.error(t('Please select employee'));
      return;
    }
    try {
      const result: any = await createEmployeePayment({
        employee: selectedEmployeeLedger,
        amount: Number(ledgerPaymentData.amount || 0),
        advanceRecovery: Number(ledgerPaymentData.advanceRecovery || 0),
        transactionDate: ledgerPaymentData.paymentDate,
        paymentMethod: 'Cash',
        notes: ledgerPaymentData.notes || undefined,
      }).unwrap();
      if (Number(result?.advanceRecoveryAmount || 0) > 0) {
        toast.success(t('Payment saved. Advance recovery recorded.'));
      } else {
        toast.success(t('Payment saved'));
      }
      setShowLedgerPayDialog(false);
      setLedgerPaymentData({
        amount: '',
        advanceRecovery: '',
        paymentDate: toLocalDateInputValue(),
        notes: '',
      });
      refetch();
      refetchEmployeeLedger();
      refetchEmployeeLedgerSummary();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to save payment'));
    }
  };

  const handleLedgerAdvance = async () => {
    if (!selectedEmployeeLedger) {
      toast.error(t('Please select employee'));
      return;
    }
    try {
      await createEmployeeAdvancePayment({
        employee: selectedEmployeeLedger,
        amount: Number(ledgerAdvanceData.amount),
        transactionDate: ledgerAdvanceData.paymentDate,
        paymentMethod: 'Cash',
        notes: ledgerAdvanceData.notes || undefined,
      }).unwrap();
      toast.success(t('Advance recorded'));
      setShowLedgerAdvanceDialog(false);
      setLedgerAdvanceData({
        amount: '',
        paymentDate: toLocalDateInputValue(),
        notes: '',
      });
      refetch();
      refetchEmployeeLedger();
      refetchEmployeeLedgerSummary();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to save advance'));
    }
  };

  const handleLedgerRecover = async () => {
    if (!selectedEmployeeLedger) {
      toast.error(t('Please select employee'));
      return;
    }
    try {
      await createEmployeePayment({
        employee: selectedEmployeeLedger,
        amount: 0,
        advanceRecovery: Number(ledgerRecoverData.amount),
        recoverySource: 'standalone',
        transactionDate: ledgerRecoverData.paymentDate,
        paymentMethod: 'Cash',
        notes: ledgerRecoverData.notes || undefined,
      }).unwrap();
      toast.success(t('Advance recovery recorded'));
      setShowLedgerRecoverDialog(false);
      setLedgerRecoverData({
        amount: '',
        paymentDate: toLocalDateInputValue(),
        notes: '',
      });
      refetch();
      refetchEmployeeLedger();
      refetchEmployeeLedgerSummary();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to record advance recovery'));
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
        ? toLocalDateInputValue(new Date(entry.transactionDate))
        : toLocalDateInputValue(),
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
      toast.success(
        ['salary_payment', 'advance_payment'].includes(selectedLedgerEntry.transactionType)
          ? t('Payment updated across ledger, expenses, and cash book')
          : t('Ledger entry updated'),
      );
      setShowLedgerEditDialog(false);
      setSelectedLedgerEntry(null);
      refetchEmployeeLedger();
      refetchEmployeeLedgerSummary();
      refetch();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to update ledger entry'));
    }
  };

  const handleLedgerEntryDelete = async () => {
    if (!selectedLedgerEntry) return;
    try {
      await deleteEmployeeLedgerEntry(selectedLedgerEntry.id).unwrap();
      toast.success(
        ['salary_payment', 'advance_payment'].includes(selectedLedgerEntry.transactionType)
          ? t('Payment deleted from ledger, expenses, and cash book')
          : t('Ledger entry deleted'),
      );
      setShowLedgerDeleteDialog(false);
      setSelectedLedgerEntry(null);
      refetchEmployeeLedger();
      refetchEmployeeLedgerSummary();
      refetch();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to delete ledger entry'));
    }
  };

  const openLedgerDeleteDialog = (entry: any) => {
    setSelectedLedgerEntry(entry);
    setShowLedgerDeleteDialog(true);
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

  const advanceLedgerEntries = useMemo(() => {
    return sortedLedgerEntries.filter((entry: any) =>
      entry.transactionType === 'advance_payment' || entry.transactionType === 'advance_recovery'
    );
  }, [sortedLedgerEntries]);

  const salaryLedgerEntries = useMemo(() => {
    // A recovery entered alongside a Pay ("Deduct from Advance") is really
    // "salary paid from advance" and belongs in the Ledger view too. A bare
    // advance_payment (money given, not yet earned back), or a standalone
    // recovery from the Advances tab's "Recover Advance" button, stays out of
    // the Ledger view — those only show under Advances.
    return sortedLedgerEntries.filter((entry: any) => {
      if (entry.transactionType === 'advance_payment') return false;
      if (entry.transactionType === 'advance_recovery') return entry.description === 'Salary paid from advance';
      return true;
    });
  }, [sortedLedgerEntries]);

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
              <EmployeePayrollMonthlySummary
                employeeId={selectedEmployeeLedger}
                year={summaryYear}
                onYearChange={setSummaryYear}
              />

              <Tabs defaultValue="ledger" className="w-full">
                <TabsList>
                  <TabsTrigger value="ledger">{t('Ledger')}</TabsTrigger>
                  <TabsTrigger value="advances">{t('Advances')}</TabsTrigger>
                </TabsList>

                <TabsContent value="ledger" className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
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
                    <div className="p-3 rounded-lg bg-purple-50">
                      <p className="text-xs text-muted-foreground">{t('Outstanding Advance')}</p>
                      <p className="font-semibold">{formatCurrency(employeeLedgerSummary?.outstandingAdvance || 0)}</p>
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
                        {salaryLedgerEntries.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                              {t('No ledger entries found')}
                            </TableCell>
                          </TableRow>
                        ) : (
                          salaryLedgerEntries.map((entry: any) => {
                            return (
                              <TableRow key={entry.id}>
                                <TableCell>{new Date(entry.transactionDate).toLocaleDateString('en-GB')}</TableCell>
                                <TableCell>{entry.reference || entry.notes || '-'}</TableCell>
                                <TableCell>{formatCurrency(entry.debit || 0)}</TableCell>
                                <TableCell>{formatCurrency(entry.credit || 0)}</TableCell>
                                <TableCell className="font-medium">{formatCurrency(entry.balance || 0)}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button size="sm" variant="outline" onClick={() => openLedgerEditDialog(entry)}>
                                      <Pencil className="h-4 w-4 mr-1" />
                                      {t('Edit')}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-red-600 hover:text-red-700"
                                      onClick={() => openLedgerDeleteDialog(entry)}
                                    >
                                      <Trash2 className="h-4 w-4 mr-1" />
                                      {t('Delete')}
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="advances" className="space-y-4 mt-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="text-sm text-muted-foreground">
                      {t('Advances given to this employee and how much has been recovered. These do not appear in the Expense report.')}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setShowLedgerAdvanceDialog(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        {t('Give Advance')}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowLedgerRecoverDialog(true)}
                        disabled={!(Number(employeeLedgerSummary?.outstandingAdvance || 0) > 0)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        {t('Recover Advance')}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-orange-50">
                      <p className="text-xs text-muted-foreground">{t('Advance Given')}</p>
                      <p className="font-semibold">{formatCurrency(employeeLedgerSummary?.totalAdvancePaid || 0)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-green-50">
                      <p className="text-xs text-muted-foreground">{t('Advance Recovered')}</p>
                      <p className="font-semibold">{formatCurrency(employeeLedgerSummary?.totalAdvanceRecovered || 0)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-purple-50">
                      <p className="text-xs text-muted-foreground">{t('Outstanding Advance')}</p>
                      <p className="font-semibold">{formatCurrency(employeeLedgerSummary?.outstandingAdvance || 0)}</p>
                    </div>
                  </div>

                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('Date')}</TableHead>
                          <TableHead>{t('Type')}</TableHead>
                          <TableHead>{t('Reference')}</TableHead>
                          <TableHead>{t('Amount')}</TableHead>
                          <TableHead className="text-right">{t('Actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {advanceLedgerEntries.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                              {t('No advances recorded')}
                            </TableCell>
                          </TableRow>
                        ) : (
                          advanceLedgerEntries.map((entry: any) => (
                            <TableRow key={entry.id}>
                              <TableCell>{new Date(entry.transactionDate).toLocaleDateString('en-GB')}</TableCell>
                              <TableCell>
                                {entry.transactionType === 'advance_payment' ? t('Advance Given') : t('Advance Recovered')}
                              </TableCell>
                              <TableCell>{entry.reference || entry.notes || '-'}</TableCell>
                              <TableCell>{formatCurrency(entry.credit || 0)}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button size="sm" variant="outline" onClick={() => openLedgerEditDialog(entry)}>
                                    <Pencil className="h-4 w-4 mr-1" />
                                    {t('Edit')}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-600 hover:text-red-700"
                                    onClick={() => openLedgerDeleteDialog(entry)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-1" />
                                    {t('Delete')}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
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
                min="0"
                step="0.01"
                value={ledgerPaymentData.amount}
                onChange={(e) => setLedgerPaymentData({ ...ledgerPaymentData, amount: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {t('You can pay up to')}: {formatCurrency(employeeLedgerSummary?.payableNow || 0)}
              </p>
            </div>
            {Number(employeeLedgerSummary?.outstandingAdvance || 0) > 0 && (
              <div className="space-y-2">
                <Label>{t('Deduct from Advance')}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  max={employeeLedgerSummary?.outstandingAdvance || 0}
                  value={ledgerPaymentData.advanceRecovery}
                  onChange={(e) => setLedgerPaymentData({ ...ledgerPaymentData, advanceRecovery: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  {t('Outstanding Advance')}: {formatCurrency(employeeLedgerSummary?.outstandingAdvance || 0)}
                </p>
              </div>
            )}
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
            <Button
              onClick={handleLedgerPay}
              disabled={isPayingEmployee || (!Number(ledgerPaymentData.amount) && !Number(ledgerPaymentData.advanceRecovery))}
            >
              {isPayingEmployee ? t('Processing...') : t('Pay')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ledger Advance Dialog */}
      <Dialog open={showLedgerAdvanceDialog} onOpenChange={setShowLedgerAdvanceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Give Advance')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('Amount')}</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={ledgerAdvanceData.amount}
                onChange={(e) => setLedgerAdvanceData({ ...ledgerAdvanceData, amount: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {t('This will not appear in the Expense report; it will still be recorded in the Cash Book and can be recovered later from a salary payment.')}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t('Payment Date')}</Label>
              <Input
                type="date"
                value={ledgerAdvanceData.paymentDate}
                onChange={(e) => setLedgerAdvanceData({ ...ledgerAdvanceData, paymentDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('Notes')}</Label>
              <Input
                value={ledgerAdvanceData.notes}
                onChange={(e) => setLedgerAdvanceData({ ...ledgerAdvanceData, notes: e.target.value })}
                placeholder={t('Optional notes')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLedgerAdvanceDialog(false)}>
              {t('Cancel')}
            </Button>
            <Button onClick={handleLedgerAdvance} disabled={isCreatingAdvance || !ledgerAdvanceData.amount}>
              {isCreatingAdvance ? t('Processing...') : t('Give Advance')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ledger Recover Advance Dialog */}
      <Dialog open={showLedgerRecoverDialog} onOpenChange={setShowLedgerRecoverDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Recover Advance')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('Amount')}</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                max={employeeLedgerSummary?.outstandingAdvance || 0}
                value={ledgerRecoverData.amount}
                onChange={(e) => setLedgerRecoverData({ ...ledgerRecoverData, amount: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {t('Outstanding Advance')}: {formatCurrency(employeeLedgerSummary?.outstandingAdvance || 0)} — {t('this is a bookkeeping entry only, no cash moves, so it will not affect the Cash Book or Expense report.')}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t('Date')}</Label>
              <Input
                type="date"
                value={ledgerRecoverData.paymentDate}
                onChange={(e) => setLedgerRecoverData({ ...ledgerRecoverData, paymentDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('Notes')}</Label>
              <Input
                value={ledgerRecoverData.notes}
                onChange={(e) => setLedgerRecoverData({ ...ledgerRecoverData, notes: e.target.value })}
                placeholder={t('Optional notes')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLedgerRecoverDialog(false)}>
              {t('Cancel')}
            </Button>
            <Button
              onClick={handleLedgerRecover}
              disabled={
                isPayingEmployee ||
                !ledgerRecoverData.amount ||
                Number(ledgerRecoverData.amount) > Number(employeeLedgerSummary?.outstandingAdvance || 0)
              }
            >
              {isPayingEmployee ? t('Processing...') : t('Recover Advance')}
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

      {/* Ledger Delete Dialog */}
      <Dialog open={showLedgerDeleteDialog} onOpenChange={setShowLedgerDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Delete Ledger Entry')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {selectedLedgerEntry &&
            ['salary_payment', 'advance_payment'].includes(selectedLedgerEntry.transactionType)
              ? t('This will delete the payment from the ledger, expenses, and cash book.')
              : t('This will permanently delete this ledger entry and recalculate balances.')}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLedgerDeleteDialog(false)}>
              {t('Cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleLedgerEntryDelete}
              disabled={isDeletingLedgerEntry}
            >
              {isDeletingLedgerEntry ? t('Deleting...') : t('Delete')}
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
