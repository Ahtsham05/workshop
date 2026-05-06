import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Printer, Zap, DollarSign, Search, CheckCircle2, Clock, AlertTriangle, RefreshCcw, X, TrendingDown, History, CalendarCheck, Wrench, Wallet, ArrowUpCircle, ChevronsUp, PlusCircle, Trash2, Plus, Calculator } from 'lucide-react';
import {
  useGetFeeVouchersQuery,
  useGetSchoolClassesQuery,
  useGetFeeStructuresQuery,
  useBulkGenerateFeeVouchersMutation,
  usePayFeeVoucherMutation,
  useGetFeeVouchersForPrintMutation,
  useGetStudentFeeSummaryQuery,
  useReconcileFeeVouchersMutation,
  useBulkPayStudentFeeVouchersMutation,
  useRecordStudentAdvancePaymentMutation,
  useGetStudentBalancesQuery,
  useGetReceivableSummaryQuery,
  useCreateFeeVoucherMutation,
  useGetStudentsQuery,
} from '@/stores/school.api';
import { useGetMyOrganizationQuery } from '@/stores/organization.api';
import { useGetBranchQuery } from '@/stores/branch.api';
import { invoiceNoteToSafeHtml } from '@/lib/escape-html';
import { useSelector } from 'react-redux';
import { RootState } from '@/stores/store';
import { toast } from 'sonner';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'online', label: 'Online' },
  { value: 'other', label: 'Other' },
];

/** Compute net amount from feeItems when the stored netAmount is missing/zero (stale data) */
const vNet = (v: any): number => {
  if (v.netAmount && v.netAmount > 0) return v.netAmount;
  const itemsTotal = (v.feeItems || []).reduce((s: number, fi: any) => s + (fi.amount || 0), 0);
  return Math.max(0, itemsTotal - (v.discount || 0) + (v.fine || 0));
};

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  unpaid:    { bg: 'bg-amber-50 border-amber-200',   text: 'text-amber-700',  label: 'Unpaid' },
  partial:   { bg: 'bg-blue-50 border-blue-200',     text: 'text-blue-700',   label: 'Partial' },
  paid:      { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', label: 'Paid' },
  overdue:   { bg: 'bg-red-50 border-red-200',       text: 'text-red-700',    label: 'Overdue' },
  cancelled: { bg: 'bg-gray-50 border-gray-200',     text: 'text-gray-500',   label: 'Cancelled' },
};

function compareMonthYear(a: { month: string; year: number }, b: { month: string; year: number }): number {
  if (a.year !== b.year) return a.year - b.year;
  return MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month);
}

function addCalendarMonths(monthName: string, year: number, delta: number): { month: string; year: number } {
  const idx = MONTHS.indexOf(monthName);
  if (idx < 0) return { month: monthName, year };
  let m = idx + delta;
  let y = year;
  while (m > 11) {
    m -= 12;
    y += 1;
  }
  while (m < 0) {
    m += 12;
    y -= 1;
  }
  return { month: MONTHS[m], year: y };
}

function maxMonthYearInList(list: { month: string; year: number }[]): { month: string; year: number } | null {
  if (!list.length) return null;
  return list.reduce((best, x) => (compareMonthYear(x, best) > 0 ? x : best));
}

/** Best guess monthly fee for projecting advance receipts */
function estimateMonthlyFee(voucher: any, studentSummary: any, studentRow?: any): number {
  const fromStructure = studentRow?.feeStructure?.monthlyFee;
  if (fromStructure != null && Number(fromStructure) > 0) return Number(fromStructure);
  const items = voucher?.feeItems || [];
  const monthlyLine = items.find((fi: any) => /monthly/i.test(String(fi?.name || '')));
  if (monthlyLine?.amount != null && Number(monthlyLine.amount) > 0) return Number(monthlyLine.amount);
  const sub = items.reduce((s: number, fi: any) => s + (fi.amount || 0), 0);
  if (sub > 0) return sub;
  const pend = studentSummary?.pendingVouchers?.[0];
  if (pend?.netAmount != null && Number(pend.netAmount) > 0) return Number(pend.netAmount);
  return 0;
}

/** Synthetic “paid” vouchers for future months covered by advance (for printing only; not saved). */
function buildAdvanceProjectionVouchers(
  template: { studentId: any; classId: any; sectionId: any },
  startAfterMonth: string,
  startAfterYear: number,
  advanceAmount: number,
  monthlyFee: number,
): any[] {
  const out: any[] = [];
  let pool = Math.max(0, advanceAmount);
  if (pool <= 0) return out;

  let { month, year } = addCalendarMonths(startAfterMonth, startAfterYear, 1);
  let seq = 1;

  if (monthlyFee <= 0) {
    const due = new Date(year, MONTHS.indexOf(month), 10);
    out.push({
      isAdvanceProjection: true,
      month,
      year,
      netAmount: pool,
      status: 'paid',
      paidAmount: pool,
      discount: 0,
      fine: 0,
      feeItems: [{ name: 'Advance fee (on account)', amount: pool }],
      voucherNumber: `ADV-${String(year).slice(2)}-${String(seq).padStart(3, '0')}`,
      dueDate: due.toISOString(),
      studentId: template.studentId,
      classId: template.classId,
      sectionId: template.sectionId,
    });
    return out;
  }

  while (pool >= monthlyFee) {
    const due = new Date(year, MONTHS.indexOf(month), 10);
    out.push({
      isAdvanceProjection: true,
      month,
      year,
      netAmount: monthlyFee,
      status: 'paid',
      paidAmount: monthlyFee,
      discount: 0,
      fine: 0,
      feeItems: [{ name: `Tuition / Monthly fee — advance for ${month} ${year}`, amount: monthlyFee }],
      voucherNumber: `ADV-${String(year).slice(2)}-${String(seq).padStart(3, '0')}`,
      dueDate: due.toISOString(),
      studentId: template.studentId,
      classId: template.classId,
      sectionId: template.sectionId,
    });
    pool -= monthlyFee;
    seq += 1;
    const next = addCalendarMonths(month, year, 1);
    month = next.month;
    year = next.year;
  }

  if (pool > 0) {
    const due = new Date(year, MONTHS.indexOf(month), 10);
    out.push({
      isAdvanceProjection: true,
      month,
      year,
      netAmount: pool,
      status: 'paid',
      paidAmount: pool,
      discount: 0,
      fine: 0,
      feeItems: [{ name: `Partial advance toward ${month} ${year} (remainder on credit)`, amount: pool }],
      voucherNumber: `ADV-${String(year).slice(2)}-${String(seq).padStart(3, '0')}`,
      dueDate: due.toISOString(),
      studentId: template.studentId,
      classId: template.classId,
      sectionId: template.sectionId,
    });
  }

  return out;
}

export default function FeeVouchers() {
  const now = new Date();
  const user = useSelector((state: RootState) => state.auth.data?.user);
  const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId });
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId);
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId });

  const [filters, setFilters] = useState({
    month: MONTHS[now.getMonth()],
    year: now.getFullYear(),
    classId: 'all',
    status: 'all',
    search: '',
    page: 1,
    limit: 25,
  });
  const [searchInput, setSearchInput] = useState('');
  const [generateDialog, setGenerateDialog] = useState(false);
  const [payDialog, setPayDialog] = useState(false);
  const [advanceDialog, setAdvanceDialog] = useState(false);
  const [advanceStudent, setAdvanceStudent] = useState<any>(null);
  const [advanceForm, setAdvanceForm] = useState({ amount: '', paymentMethod: 'cash', remarks: '' });
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [payForm, setPayForm] = useState({ amount: '', paymentMethod: 'cash', remarks: '' });
  const [genForm, setGenForm] = useState({
    classId: '', feeStructureId: '',
    month: MONTHS[now.getMonth()], year: now.getFullYear(),
    feeSource: 'admission_form' as 'admission_form' | 'fee_structure' | 'mixed',
  });

  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100 });
  const { data: structuresData } = useGetFeeStructuresQuery(genForm.classId ? { classId: genForm.classId } : {});
  const structures = (structuresData?.results || []).filter((s: any) =>
    !genForm.classId || (s.classId?.id || s.classId) === genForm.classId
  );

  const voucherParams: any = {
    page: filters.page, limit: filters.limit,
    month: filters.month, year: filters.year,
  };
  if (filters.classId !== 'all') voucherParams.classId = filters.classId;
  if (filters.status !== 'all') voucherParams.status = filters.status;
  if (filters.search) voucherParams.search = filters.search;

  const { data: vouchersData, isLoading, isFetching } = useGetFeeVouchersQuery(voucherParams);
  const [bulkGenerate, { isLoading: generating }] = useBulkGenerateFeeVouchersMutation();
  const [payVoucher, { isLoading: paying }] = usePayFeeVoucherMutation();
  const [bulkPay, { isLoading: bulkPaying }] = useBulkPayStudentFeeVouchersMutation();
  const [recordAdvance, { isLoading: recordingAdvance }] = useRecordStudentAdvancePaymentMutation();
  const [getForPrint, { isLoading: loadingPrint }] = useGetFeeVouchersForPrintMutation();
  const [reconcile, { isLoading: reconciling }] = useReconcileFeeVouchersMutation();
  const [createVoucher, { isLoading: creatingVoucher }] = useCreateFeeVoucherMutation();

  // ── New voucher dialog state ──────────────────────────────────────────────
  const [newVoucherDialog, setNewVoucherDialog] = useState(false);
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [debouncedStudentSearch, setDebouncedStudentSearch] = useState('');
  const [selectedStudentForVoucher, setSelectedStudentForVoucher] = useState<any>(null);
  const [nvForm, setNvForm] = useState({
    month: MONTHS[now.getMonth()],
    year: now.getFullYear(),
    dueDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-10`,
    discount: '',
    remarks: '',
    prorateFee: false,
    feeItems: [] as { name: string; amount: string }[],
  });

  // Debounce the student search — only fire the query 400ms after the user stops typing
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedStudentSearch(studentSearchTerm), 400);
    return () => clearTimeout(timer);
  }, [studentSearchTerm]);

  const { data: studentSearchResults } = useGetStudentsQuery(
    { search: debouncedStudentSearch, limit: 8 },
    { skip: !debouncedStudentSearch || !!selectedStudentForVoucher }
  );

  // Resolve studentId for the summary query (populated object or plain id string)
  const summaryStudentId = selectedVoucher
    ? (selectedVoucher.studentId?.id || selectedVoucher.studentId?._id || selectedVoucher.studentId || '')
    : '';
  const { data: studentSummary, isLoading: loadingSummary } = useGetStudentFeeSummaryQuery(
    summaryStudentId,
    { skip: !payDialog || !summaryStudentId },
  );

  const vouchers = vouchersData?.results || [];
  const classes = classesData?.results || [];

  // Batch-fetch credit balance + total outstanding for all students in current page
  const studentIds = useMemo(() =>
    [...new Set(vouchers.map((v: any) => v.studentId?.id || v.studentId?._id || v.studentId).filter(Boolean))],
    [vouchers]
  );
  const { data: studentBalances } = useGetStudentBalancesQuery(
    { ids: studentIds as string[], month: filters.month, year: filters.year },
    { skip: studentIds.length === 0 }
  );
  const getStudentBalance = (v: any) => {
    const sid = v.studentId?.id || v.studentId?._id || v.studentId;
    return studentBalances?.[sid] ?? {
      totalOutstanding: 0,
      thisMonthOutstanding: 0,
      previousArrears: 0,
      futureMonthsOutstanding: 0,
      creditBalance: 0,
      pendingCount: 0,
    };
  };

  // Org-level receivable summary — scoped to selected class when not "All Classes"
  const { data: receivable } = useGetReceivableSummaryQuery(
    {
      month: filters.month,
      year: filters.year,
      ...(filters.classId !== 'all' ? { classId: filters.classId } : {}),
    },
    { skip: false }
  );

  // Stats from current page
  const stats = useMemo(() => {
    const all = vouchers;
    return {
      total: vouchersData?.totalResults || 0,
      paid: all.filter((v: any) => v.status === 'paid').length,
      unpaid: all.filter((v: any) => v.status === 'unpaid').length,
      overdue: all.filter((v: any) => v.status === 'overdue').length,
      collected: all.reduce((s: number, v: any) => s + (v.paidAmount || 0), 0),
      expected: all.reduce((s: number, v: any) => s + vNet(v), 0),
    };
  }, [vouchers, vouchersData]);

  const handleSearchSubmit = () => {
    setFilters((f) => ({ ...f, search: searchInput.trim(), page: 1 }));
  };

  const clearSearch = () => {
    setSearchInput('');
    setFilters((f) => ({ ...f, search: '', page: 1 }));
  };

  /** When a student is selected in the new-voucher dialog, auto-fill their fee items. */
  const selectStudentForVoucher = (student: any) => {
    setSelectedStudentForVoucher(student);
    setStudentSearchTerm('');
    const fee = student.feeStructure || {};
    const admDate = new Date();
    const totalDays = new Date(admDate.getFullYear(), admDate.getMonth() + 1, 0).getDate();
    const remainingDays = totalDays - admDate.getDate() + 1;
    const buildItems = (prorate: boolean) => {
      const items: { name: string; amount: string }[] = [];
      if (fee.admissionFee > 0) items.push({ name: 'Admission Fee', amount: String(fee.admissionFee) });
      if (fee.monthlyFee > 0) {
        const mf = prorate && admDate.getDate() > 1
          ? Math.ceil((remainingDays / totalDays) * fee.monthlyFee)
          : fee.monthlyFee;
        const label = prorate && admDate.getDate() > 1
          ? `Monthly Fee (${remainingDays}/${totalDays} days)`
          : 'Monthly Fee';
        items.push({ name: label, amount: String(mf) });
      }
      if (fee.transportFee > 0) items.push({ name: 'Transport Fee', amount: String(fee.transportFee) });
      return items;
    };
    setNvForm((f) => ({
      ...f,
      discount: fee.discount ? String(fee.discount) : '',
      feeItems: buildItems(f.prorateFee),
    }));
  };

  /** Recalculate fee items when proration toggle changes. */
  const toggleProrateFee = (checked: boolean) => {
    if (!selectedStudentForVoucher) {
      setNvForm((f) => ({ ...f, prorateFee: checked }));
      return;
    }
    const fee = selectedStudentForVoucher.feeStructure || {};
    const admDate = new Date();
    const totalDays = new Date(admDate.getFullYear(), admDate.getMonth() + 1, 0).getDate();
    const remainingDays = totalDays - admDate.getDate() + 1;
    setNvForm((f) => {
      const newItems = f.feeItems.map((item) => {
        if (item.name.startsWith('Monthly Fee')) {
          const mf = fee.monthlyFee || 0;
          const newAmount = checked && admDate.getDate() > 1
            ? Math.ceil((remainingDays / totalDays) * mf)
            : mf;
          const newName = checked && admDate.getDate() > 1
            ? `Monthly Fee (${remainingDays}/${totalDays} days)`
            : 'Monthly Fee';
          return { name: newName, amount: String(newAmount) };
        }
        return item;
      });
      return { ...f, prorateFee: checked, feeItems: newItems };
    });
  };

  const openNewVoucherDialog = () => {
    setSelectedStudentForVoucher(null);
    setStudentSearchTerm('');
    setNvForm({
      month: MONTHS[now.getMonth()],
      year: now.getFullYear(),
      dueDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-10`,
      discount: '',
      remarks: '',
      prorateFee: false,
      feeItems: [],
    });
    setNewVoucherDialog(true);
  };

  const handleCreateVoucher = async () => {
    if (!selectedStudentForVoucher) return toast.error('Select a student first');
    if (!nvForm.feeItems.length) return toast.error('Add at least one fee item');
    const student = selectedStudentForVoucher;
    try {
      await createVoucher({
        studentId: student.id || student._id,
        classId: student.classId?.id || student.classId?._id || student.classId,
        sectionId: student.sectionId?.id || student.sectionId?._id || student.sectionId || undefined,
        month: nvForm.month,
        year: nvForm.year,
        feeItems: nvForm.feeItems
          .filter((fi) => fi.name.trim() && Number(fi.amount) > 0)
          .map((fi) => ({ name: fi.name.trim(), amount: Number(fi.amount) })),
        discount: nvForm.discount ? Number(nvForm.discount) : 0,
        dueDate: nvForm.dueDate,
        remarks: nvForm.remarks || undefined,
      }).unwrap();
      toast.success('Voucher created successfully');
      setNewVoucherDialog(false);
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to create voucher');
    }
  };

  const handleGenerate = async () => {
    if (!genForm.classId) return toast.error('Select a class');
    if (genForm.feeSource !== 'admission_form' && !genForm.feeStructureId) return toast.error('Select a fee structure');
    try {
      const payload: any = {
        classId: genForm.classId,
        month: genForm.month,
        year: genForm.year,
        feeSource: genForm.feeSource,
      };
      if (genForm.feeStructureId) payload.feeStructureId = genForm.feeStructureId;
      const result = await bulkGenerate(payload).unwrap();
      const skipped = result.skipped ? ` · ${result.skipped} skipped (no fees)` : '';
      const dups = result.skippedDuplicates ? ` · ${result.skippedDuplicates} already had this month` : '';
      const autoApplied = result.autoAppliedCount
        ? ` · ${result.autoAppliedCount} auto-paid from wallet (PKR ${(result.autoAppliedAmount || 0).toLocaleString()})`
        : '';
      toast.success(`Generated ${result.generated} / ${result.total} vouchers${skipped}${dups}${autoApplied}`);
      setGenerateDialog(false);
      setGenForm({ classId: '', feeStructureId: '', month: MONTHS[now.getMonth()], year: now.getFullYear(), feeSource: 'admission_form' });
    } catch (err: any) { toast.error(err?.data?.message || 'Generation failed'); }
  };

  const openPay = (v: any, suggestedAmount?: number) => {
    setSelectedVoucher(v);
    const remaining = Math.max(0, vNet(v) - (v.paidAmount || 0));
    const initialAmount = suggestedAmount != null ? Math.max(0, suggestedAmount) : remaining;
    setPayForm({ amount: String(initialAmount), paymentMethod: 'cash', remarks: '' });
    setPayDialog(true);
  };

  const handlePay = async () => {
    if (!selectedVoucher || !payForm.amount || Number(payForm.amount) <= 0) {
      return toast.error('Enter a valid amount');
    }
    const amountToPay = Number(payForm.amount);
    const svNetAmount = svNet;
    const currentRemaining = svNetAmount - (selectedVoucher.paidAmount || 0);
    try {
      if (amountToPay > currentRemaining) {
        // Amount spans multiple vouchers — use bulk distribution (oldest-first)
        const result = await bulkPay({
          studentId: summaryStudentId,
          amount: amountToPay,
          paymentMethod: payForm.paymentMethod,
          remarks: payForm.remarks,
        }).unwrap();
        const count = result?.vouchersPaid?.length ?? 0;
        const newCredit = result?.newCreditBalance ?? 0;
        const excessDeposited = Number(result?.excessDeposited ?? 0);
        let msg = `PKR ${amountToPay.toLocaleString()} applied across ${count} voucher${count !== 1 ? 's' : ''}`;
        if (newCredit > 0) msg += ` · PKR ${newCredit.toLocaleString()} saved to credit wallet`;
        toast.success(msg);

        const ids = (result?.vouchersPaid || [])
          .map((x: any) => x?.voucherId)
          .filter(Boolean)
          .map((id: any) => (typeof id === 'string' ? id : id?.toString?.() ?? ''))
          .filter(Boolean);
        let printRows: any[] = [];
        if (ids.length) {
          try {
            printRows = await getForPrint(ids).unwrap();
          } catch {
            toast.error('Payment saved but print preview failed to load');
          }
        }
        if (excessDeposited > 0) {
          const studentRow = selectedVoucher?.studentId;
          const monthlyFee = estimateMonthlyFee(selectedVoucher, studentSummary, studentRow);
          const paidMonths = (result?.vouchersPaid || []).map((x: any) => ({
            month: x.month,
            year: Number(x.year),
          }));
          const latestPaid = maxMonthYearInList(paidMonths);
          const startAfter = latestPaid ?? {
            month: selectedVoucher.month,
            year: Number(selectedVoucher.year),
          };
          printRows = [
            ...printRows,
            ...buildAdvanceProjectionVouchers(
              {
                studentId: studentRow,
                classId: selectedVoucher.classId,
                sectionId: selectedVoucher.sectionId,
              },
              startAfter.month,
              startAfter.year,
              excessDeposited,
              monthlyFee,
            ),
          ];
        }
        if (printRows.length) openPrintWindow(printRows);
      } else {
        await payVoucher({
          id: selectedVoucher.id,
          amount: amountToPay,
          paymentMethod: payForm.paymentMethod,
          remarks: payForm.remarks,
        }).unwrap();
        toast.success('Payment recorded successfully');
      }
      setPayDialog(false);
    } catch (err: any) { toast.error(err?.data?.message || 'Payment failed'); }
  };

  const openAdvance = (v: any) => {
    setAdvanceStudent(v.studentId);
    setAdvanceForm({ amount: '', paymentMethod: 'cash', remarks: '' });
    setAdvanceDialog(true);
  };

  const handleAdvance = async () => {
    if (!advanceStudent || !advanceForm.amount || Number(advanceForm.amount) <= 0) {
      return toast.error('Enter a valid amount');
    }
    const sid = advanceStudent?.id || advanceStudent?._id || advanceStudent;
    try {
      const amountNum = Number(advanceForm.amount);
      const result = await recordAdvance({
        studentId: sid,
        amount: amountNum,
        paymentMethod: advanceForm.paymentMethod,
        remarks: advanceForm.remarks,
      }).unwrap();
      toast.success(`PKR ${amountNum.toLocaleString()} added to credit wallet. New balance: PKR ${(result.creditBalance || 0).toLocaleString()}`);
      const studentRow = advanceStudent;
      const monthlyFee = estimateMonthlyFee(null, null, studentRow);
      const startAfter = { month: filters.month, year: Number(filters.year) };
      const synth = buildAdvanceProjectionVouchers(
        {
          studentId: studentRow,
          classId: studentRow?.classId,
          sectionId: studentRow?.sectionId,
        },
        startAfter.month,
        startAfter.year,
        amountNum,
        monthlyFee,
      );
      if (synth.length) openPrintWindow(synth);
      setAdvanceDialog(false);
    } catch (err: any) { toast.error(err?.data?.message || 'Failed to record advance'); }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };
  const toggleSelectAll = () => {
    if (selectedIds.length === vouchers.length) setSelectedIds([]);
    else setSelectedIds(vouchers.map((v: any) => v.id));
  };

  const handlePrint = async (overrideVouchers?: any[]) => {
    if (overrideVouchers) {
      openPrintWindow(overrideVouchers);
      return;
    }
    const ids = selectedIds.length ? selectedIds : vouchers.map((v: any) => v.id);
    if (!ids.length) return toast.error('No vouchers to print');
    try {
      const data = await getForPrint(ids).unwrap();
      openPrintWindow(data);
    } catch { toast.error('Could not load print data'); }
  };

  const handleReconcile = async () => {
    try {
      const res = await reconcile(undefined).unwrap();
      toast.success(`Fixed ${res.fixed} voucher(s)${res.failed ? ` · ${res.failed} failed` : ''}`);
    } catch { toast.error('Reconcile failed'); }
  };

  const openPrintWindow = (data: any[]) => {    const win = window.open('', '_blank');
    if (!win) return toast.error('Allow pop-ups to print');
    win.document.write(buildPrintHTML(data, org?.name || 'School', branchData?.invoiceNote));
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 600);
  };

  const svNet = selectedVoucher ? vNet(selectedVoucher) : 0;
  const remaining = selectedVoucher ? Math.max(0, svNet - (selectedVoucher.paidAmount || 0)) : 0;
  const quickPayFull = Math.max(remaining, Number(studentSummary?.totalPending || 0));
  const payPercent = svNet > 0
    ? Math.min(100, Math.round((Number(payForm.amount) / svNet) * 100))
    : 0;

  return (
    <div className="h-full w-full p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fee Vouchers</h1>
          <p className="text-sm text-muted-foreground">Generate, collect and print monthly fee vouchers</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(selectedIds.length > 0 || vouchers.length > 0) && (
            <Button variant="outline" size="sm" onClick={() => handlePrint()} disabled={loadingPrint}>
              <Printer className="mr-1.5 h-3.5 w-3.5" />
              {selectedIds.length > 0 ? `Print (${selectedIds.length})` : 'Print All'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleReconcile} disabled={reconciling} title="Fix vouchers showing PKR 0">
            {reconciling ? <RefreshCcw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wrench className="mr-1.5 h-3.5 w-3.5" />}
            Fix Amounts
          </Button>
          <Button variant="outline" size="sm" onClick={openNewVoucherDialog}>
            <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> New Voucher
          </Button>
          <Button size="sm" onClick={() => setGenerateDialog(true)}>
            <Zap className="mr-1.5 h-3.5 w-3.5" /> Generate Vouchers
          </Button>
        </div>
      </div>

      {/* Stats strip — Row 1: voucher counts */}
      {vouchers.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Total Vouchers', value: vouchersData?.totalResults || 0, icon: RefreshCcw, color: 'text-foreground' },
            { label: 'Paid', value: stats.paid, icon: CheckCircle2, color: 'text-emerald-600' },
            { label: 'Unpaid', value: stats.unpaid, icon: Clock, color: 'text-amber-600' },
            { label: 'Overdue', value: stats.overdue, icon: AlertTriangle, color: 'text-red-600' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-lg border bg-card px-3 py-2 flex items-center gap-2">
              <Icon className={`h-4 w-4 shrink-0 ${color}`} />
              <div>
                <p className={`text-lg font-bold leading-none ${color}`}>{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats strip — Row 2: financial receivable summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {/* This month receivable */}
        <div className="rounded-lg border bg-card px-3 py-2.5">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">{filters.month} {filters.year} Receivable</p>
          <p className="text-base font-bold text-amber-600">
            PKR {(receivable?.thisMonthReceivable || 0).toLocaleString()}
          </p>
          <p className="text-[10px] text-muted-foreground">{receivable?.thisMonthVouchers || 0} voucher(s) pending</p>
        </div>
        {/* Previous arrears */}
        <div className="rounded-lg border bg-card px-3 py-2.5">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Previous Arrears</p>
          <p className={`text-base font-bold ${(receivable?.previousArrears || 0) > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
            PKR {(receivable?.previousArrears || 0).toLocaleString()}
          </p>
          <p className="text-[10px] text-muted-foreground">{receivable?.arrearsVouchers || 0} older month(s)</p>
        </div>
        {/* Total receivable */}
        <div className="rounded-lg border bg-amber-50 border-amber-200 px-3 py-2.5">
          <p className="text-[10px] font-medium text-amber-700 uppercase tracking-wide mb-1">Total Receivable</p>
          <p className="text-base font-bold text-amber-700">
            PKR {(receivable?.totalReceivable || 0).toLocaleString()}
          </p>
          <p className="text-[10px] text-amber-600">
            {filters.month} + {receivable?.arrearsVouchers || 0} arrear(s)
          </p>
        </div>
        {/* Total Received This Month */}
        <div className="rounded-lg border bg-blue-50 border-blue-200 px-3 py-2.5">
          <p className="text-[10px] font-medium text-blue-700 uppercase tracking-wide mb-1 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> {filters.month} Received
          </p>
          <p className="text-base font-bold text-blue-700">
            PKR {(receivable?.totalReceivedThisMonth || 0).toLocaleString()}
          </p>
          <p className="text-[10px] text-blue-600">{receivable?.paidVouchersThisMonth || 0} voucher(s) paid</p>
        </div>
        {/* Advance / credit wallet */}
        <div className="rounded-lg border bg-emerald-50 border-emerald-200 px-3 py-2.5">
          <p className="text-[10px] font-medium text-emerald-700 uppercase tracking-wide mb-1 flex items-center gap-1">
            <Wallet className="h-3 w-3" /> Advance Received
          </p>
          <p className="text-base font-bold text-emerald-700">
            PKR {(receivable?.totalCreditBalance || 0).toLocaleString()}
          </p>
          <p className="text-[10px] text-emerald-600">held in credit wallet(s)</p>
          <p className="text-[10px] text-blue-600">PKR {(receivable?.totalWalletAppliedThisMonth || 0).toLocaleString()} used from wallet this month</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-48 max-w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8 h-9 pr-8"
            placeholder="Search student / adm#…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
          />
          {searchInput && (
            <button className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground" onClick={clearSearch}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={filters.month} onValueChange={(v) => setFilters({ ...filters, month: v, page: 1 })}>
          <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(filters.year)} onValueChange={(v) => setFilters({ ...filters, year: Number(v), page: 1 })}>
          <SelectTrigger className="w-20 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.classId} onValueChange={(v) => setFilters({ ...filters, classId: v, page: 1 })}>
          <SelectTrigger className="w-32 h-9"><SelectValue placeholder="All Classes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v, page: 1 })}>
          <SelectTrigger className="w-28 h-9"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Voucher Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <RefreshCcw className="mr-2 h-4 w-4 animate-spin" /> Loading vouchers…
        </div>
      ) : vouchers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <div className="rounded-full bg-muted p-4"><Zap className="h-6 w-6 text-muted-foreground" /></div>
          <div>
            <p className="font-medium">No vouchers found</p>
            <p className="text-sm text-muted-foreground">Generate vouchers for a class to get started</p>
          </div>
          <Button size="sm" onClick={() => setGenerateDialog(true)}>
            <Zap className="mr-1.5 h-3.5 w-3.5" /> Generate Now
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[2rem_1fr_auto_auto_auto] gap-3 items-center px-4 py-2 bg-muted/50 text-xs font-medium text-muted-foreground border-b">
            <Checkbox
              checked={selectedIds.length > 0 && selectedIds.length === vouchers.length}
              onCheckedChange={toggleSelectAll}
            />
            <span>Student</span>
            <span className="text-right">This Voucher</span>
            <span className="text-right">Total Due</span>
            <span className="text-right pr-1">Actions</span>
          </div>
          {/* Rows */}
          <div className={`divide-y transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
            {vouchers.map((v: any) => {
              const cfg = STATUS_CONFIG[v.status] || STATUS_CONFIG.unpaid;
              const net = vNet(v);
              const pct = net > 0 ? Math.round(((v.paidAmount || 0) / net) * 100) : 0;
              const isSelected = selectedIds.includes(v.id);
              const bal = getStudentBalance(v);
              return (
                <div
                  key={v.id}
                  className={`grid grid-cols-[2rem_1fr_auto_auto_auto] gap-3 items-center px-4 py-3 hover:bg-muted/20 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
                >
                  <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(v.id)} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {v.studentId?.firstName} {v.studentId?.lastName}
                      </span>
                      {v.studentId?.admissionNumber && (
                        <span className="text-xs text-muted-foreground">#{v.studentId.admissionNumber}</span>
                      )}
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{v.classId?.name}</Badge>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border ${cfg.bg} ${cfg.text}`}>
                        {cfg.label}
                      </span>
                      {/* Credit wallet badge */}
                      {bal.creditBalance > 0 && (
                        <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700">
                          <Wallet className="h-2.5 w-2.5" />
                          +{bal.creditBalance.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[11px] text-muted-foreground">
                        {v.voucherNumber || '—'} · {v.month} {v.year} · Due {v.dueDate ? new Date(v.dueDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </span>
                      {net > 0 && (
                        <div className="flex items-center gap-1">
                          <div className="h-1 w-16 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-blue-500' : 'bg-amber-400'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground">{pct}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">PKR {net.toLocaleString()}</p>
                    {(v.paidAmount || 0) > 0 && v.status !== 'paid' && (
                      <p className="text-[10px] text-amber-600">Due: {(net - (v.paidAmount || 0)).toLocaleString()}</p>
                    )}
                    {(v.discount || 0) > 0 && (
                      <p className="text-[10px] text-muted-foreground">Disc: {v.discount?.toLocaleString()}</p>
                    )}
                  </div>
                  {/* Total Due: all months, with arrears breakdown */}
                  <div className="text-right min-w-[90px]">
                    {bal.totalOutstanding > 0 ? (
                      <>
                        <p className="text-sm font-bold text-red-600">PKR {bal.totalOutstanding.toLocaleString()}</p>
                        {(bal.previousArrears > 0 || (bal.futureMonthsOutstanding ?? 0) > 0) ? (
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            <span className="text-amber-600">{filters.month}: {bal.thisMonthOutstanding.toLocaleString()}</span>
                            {bal.previousArrears > 0 && (
                              <>
                                {' + '}
                                <span className="text-red-500">earlier: {bal.previousArrears.toLocaleString()}</span>
                              </>
                            )}
                            {(bal.futureMonthsOutstanding ?? 0) > 0 && (
                              <>
                                {' + '}
                                <span className="text-violet-600">upcoming: {(bal.futureMonthsOutstanding ?? 0).toLocaleString()}</span>
                              </>
                            )}
                          </p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground">{bal.pendingCount} month{bal.pendingCount !== 1 ? 's' : ''} pending</p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm font-semibold text-emerald-600">All Clear</p>
                    )}
                    {bal.creditBalance > 0 && (
                      <p className="text-[10px] text-emerald-600 flex items-center justify-end gap-0.5">
                        <Wallet className="h-2.5 w-2.5" />+{bal.creditBalance.toLocaleString()} credit
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1.5 justify-end">
                    {v.status !== 'cancelled' && bal.totalOutstanding > 0 && (
                      <Button size="sm" className="h-7 text-xs px-2.5" onClick={() => openPay(v, bal.totalOutstanding)}>
                        <DollarSign className="h-3 w-3 mr-1" /> {v.status === 'paid' ? 'Collect Due' : 'Collect'}
                      </Button>
                    )}
                    <Button
                      size="icon" variant="outline" className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                      title="Record advance payment to credit wallet"
                      onClick={() => openAdvance(v)}
                    >
                      <ArrowUpCircle className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => handlePrint([v])}>
                      <Printer className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pagination */}
      {vouchersData && vouchersData.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Showing {Math.max(1, (filters.page - 1) * filters.limit + 1)}–
            {Math.min(filters.page * filters.limit, vouchersData.totalResults)} of {vouchersData.totalResults} vouchers
            {' · '}
            Page {filters.page} of {vouchersData.totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Select
              value={String(filters.limit)}
              onValueChange={(v) => setFilters({ ...filters, limit: Number(v), page: 1 })}
            >
              <SelectTrigger className="h-7 w-28 text-xs">
                <SelectValue placeholder="Rows" />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} rows</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-7" disabled={filters.page === 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>← Prev</Button>
            <Button variant="outline" size="sm" className="h-7" disabled={filters.page >= vouchersData.totalPages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Next →</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Generate Dialog ──────────────────────────────────────── */}
      <Dialog open={generateDialog} onOpenChange={setGenerateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Bulk Generate Vouchers
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Class */}
            <div className="space-y-1.5">
              <Label>Class <span className="text-destructive">*</span></Label>
              <Select value={genForm.classId} onValueChange={(v) => setGenForm({ ...genForm, classId: v, feeStructureId: '' })}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>{classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Fee source */}
            <div className="space-y-1.5">
              <Label>Fee Source <span className="text-destructive">*</span></Label>
              <Select
                value={genForm.feeSource}
                onValueChange={(v: any) => setGenForm({ ...genForm, feeSource: v, feeStructureId: '' })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admission_form">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">From Admission Form</span>
                      <span className="text-xs text-muted-foreground">Use each student's individual fees set at admission</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="fee_structure">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">From Fee Structure</span>
                      <span className="text-xs text-muted-foreground">Apply a single class-level fee structure to all students</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="mixed">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">Mixed (Prefer Admission, Fallback Fee Structure)</span>
                      <span className="text-xs text-muted-foreground">Use admission fees if set; otherwise use fee structure</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              {genForm.feeSource === 'admission_form' && (
                <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-md px-3 py-1.5">
                  Each student will get a voucher with their own monthly fee, admission fee, and transport fee set during admission. Students with no fees set will be skipped.
                </p>
              )}
              {genForm.feeSource === 'mixed' && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5">
                  Students with individual fees will use those; the rest will get the selected fee structure below.
                </p>
              )}
            </div>

            {/* Fee structure — shown only for fee_structure or mixed */}
            {genForm.feeSource !== 'admission_form' && (
              <div className="space-y-1.5">
                <Label>Fee Structure <span className="text-destructive">*</span></Label>
                <Select
                  value={genForm.feeStructureId}
                  onValueChange={(v) => setGenForm({ ...genForm, feeStructureId: v })}
                  disabled={!genForm.classId}
                >
                  <SelectTrigger><SelectValue placeholder={genForm.classId ? 'Select structure' : 'Select class first'} /></SelectTrigger>
                  <SelectContent>
                    {structures.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} — PKR {(s.totalAmount || 0).toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Month / Year */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Month</Label>
                <Select value={genForm.month} onValueChange={(v) => setGenForm({ ...genForm, month: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Year</Label>
                <Input type="number" min={2020} max={2099} value={genForm.year} onChange={(e) => setGenForm({ ...genForm, year: Number(e.target.value) })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateDialog(false)}>Cancel</Button>
            <Button
              onClick={handleGenerate}
              disabled={generating || !genForm.classId || (genForm.feeSource !== 'admission_form' && !genForm.feeStructureId)}
            >
              {generating ? <><RefreshCcw className="mr-2 h-3.5 w-3.5 animate-spin" />Generating…</> : <><Zap className="mr-2 h-3.5 w-3.5" />Generate</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Pay Dialog ───────────────────────────────────────────── */}
      <Dialog open={payDialog} onOpenChange={setPayDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-600" /> Collect Fee Payment
            </DialogTitle>
          </DialogHeader>
          {selectedVoucher && (
            <div className="space-y-3 py-1">

              {/* ── Student header ── */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-base leading-tight">
                    {selectedVoucher.studentId?.firstName} {selectedVoucher.studentId?.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedVoucher.classId?.name} · Adm# {selectedVoucher.studentId?.admissionNumber || '—'}
                  </p>
                </div>
                <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${(STATUS_CONFIG[selectedVoucher.status] || STATUS_CONFIG.unpaid).bg} ${(STATUS_CONFIG[selectedVoucher.status] || STATUS_CONFIG.unpaid).text}`}>
                  {(STATUS_CONFIG[selectedVoucher.status] || STATUS_CONFIG.unpaid).label}
                </span>
              </div>

              {/* ── Student Account Summary ── */}
              <div className="rounded-lg border overflow-hidden">
                <div className="bg-muted/60 px-3 py-2 flex items-center gap-1.5 border-b">
                  <History className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Student Account Overview</span>
                </div>
                {loadingSummary ? (
                  <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                    <RefreshCcw className="h-3 w-3 animate-spin" /> Loading account info…
                  </div>
                ) : studentSummary ? (
                  <div className="divide-y">
                    {/* Credit wallet banner — shown when credit > 0 */}
                    {(studentSummary.creditBalance || 0) > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 border-b border-emerald-100">
                        <div className="flex items-center gap-2">
                          <Wallet className="h-4 w-4 text-emerald-600 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-emerald-800">Credit Wallet Balance</p>
                            <p className="text-[10px] text-emerald-600">Will be auto-applied oldest-first on payment</p>
                          </div>
                        </div>
                        <p className="text-base font-bold text-emerald-700">PKR {studentSummary.creditBalance.toLocaleString()}</p>
                      </div>
                    )}
                    {/* Summary stats row */}
                    <div className="grid grid-cols-3 divide-x">
                      <div className="px-3 py-2.5 text-center">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Total Outstanding</p>
                        <p className={`text-sm font-bold ${studentSummary.totalPending > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          PKR {(studentSummary.totalPending || 0).toLocaleString()}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{studentSummary.pendingCount} month(s)</p>
                      </div>
                      <div className="px-3 py-2.5 text-center">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Total Received</p>
                        <p className="text-sm font-bold text-emerald-600">
                          PKR {(studentSummary.totalReceived || 0).toLocaleString()}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{studentSummary.paidCount} paid</p>
                      </div>
                      <div className="px-3 py-2.5 text-center">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Total Billed</p>
                        <p className="text-sm font-bold">
                          PKR {(studentSummary.totalBilled || 0).toLocaleString()}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{studentSummary.totalVouchers} voucher(s)</p>
                      </div>
                    </div>

                    {/* Pending months breakdown */}
                    {studentSummary.pendingVouchers?.length > 0 && (
                      <div className="px-3 py-2 space-y-1">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                          <TrendingDown className="h-3 w-3 text-red-500" /> Pending Months
                        </p>
                        <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                          {studentSummary.pendingVouchers.map((pv: any) => {
                            const cfg = STATUS_CONFIG[pv.status] || STATUS_CONFIG.unpaid;
                            const isCurrent = pv.id === (selectedVoucher.id || selectedVoucher._id);
                            return (
                              <div key={pv.id} className={`flex items-center justify-between text-xs rounded px-2 py-1 ${isCurrent ? 'bg-amber-50 border border-amber-200' : 'bg-muted/40'}`}>
                                <div className="flex items-center gap-1.5">
                                  {isCurrent && <span className="text-[9px] font-bold text-amber-600 uppercase">current</span>}
                                  <span className="font-medium">{pv.month} {pv.year}</span>
                                  <span className={`inline-flex items-center rounded-full px-1.5 py-0 text-[9px] font-medium border ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                                </div>
                                <span className="font-semibold text-red-600">PKR {pv.remaining.toLocaleString()}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Last payment info */}
                    {studentSummary.lastPaid && (
                      <div className="px-3 py-2 flex items-center gap-2 bg-emerald-50/50">
                        <CalendarCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-semibold text-emerald-700">Last Payment</p>
                          <p className="text-xs text-emerald-800">
                            {studentSummary.lastPaid.month} {studentSummary.lastPaid.year}
                            {studentSummary.lastPaid.paidDate && (
                              <> · {new Date(studentSummary.lastPaid.paidDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</>
                            )}
                          </p>
                        </div>
                        <span className="text-sm font-bold text-emerald-700">PKR {(studentSummary.lastPaid.paidAmount || 0).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              {/* ── Current voucher details ── */}
              <div className="rounded-lg border bg-muted/30 px-3 py-2.5 space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Collecting for: {selectedVoucher.month} {selectedVoucher.year} · {selectedVoucher.voucherNumber || 'No voucher #'}
                </p>
                {selectedVoucher.feeItems?.length > 0 && (
                  <div className="space-y-0.5">
                    {selectedVoucher.feeItems.map((fi: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{fi.name}</span>
                        <span>PKR {(fi.amount || 0).toLocaleString()}</span>
                      </div>
                    ))}
                    {(selectedVoucher.discount || 0) > 0 && (
                      <div className="flex justify-between text-xs text-emerald-600">
                        <span>Discount</span>
                        <span>− PKR {selectedVoucher.discount.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs font-semibold border-t pt-1 mt-1">
                      <span>Net Due</span>
                      <span>PKR {svNet.toLocaleString()}</span>
                    </div>
                    {(selectedVoucher.paidAmount || 0) > 0 && (
                      <div className="flex justify-between text-xs font-semibold text-amber-600">
                        <span>Remaining</span>
                        <span>PKR {remaining.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Amount input ── */}
              <div className="space-y-1.5">
                <Label>Amount Paying (PKR) <span className="text-destructive">*</span></Label>
                <Input
                  type="number" min={1}
                  className="text-lg font-semibold h-11"
                  value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                  autoFocus
                />
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    className="text-xs px-2 py-1 rounded border hover:bg-muted transition-colors"
                    onClick={() => setPayForm({ ...payForm, amount: String(quickPayFull) })}
                  >
                    Full — PKR {quickPayFull.toLocaleString()}
                  </button>
                  {remaining > 0 && (
                    <button
                      className="text-xs px-2 py-1 rounded border hover:bg-muted transition-colors"
                      onClick={() => setPayForm({ ...payForm, amount: String(Math.floor(remaining / 2)) })}
                    >
                      Half — PKR {Math.floor(remaining / 2).toLocaleString()}
                    </button>
                  )}
                  {/* Use credit wallet shortcut */}
                  {studentSummary && studentSummary.creditBalance > 0 && remaining > 0 && (
                    <button
                      className="text-xs px-2 py-1 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors flex items-center gap-1"
                      onClick={() => setPayForm({ ...payForm, amount: '0' })}
                      title="Credit will auto-apply when paying — no extra cash needed if credit covers it"
                    >
                      <Wallet className="h-3 w-3" />
                      Credit: +{studentSummary.creditBalance.toLocaleString()}
                    </button>
                  )}
                  {/* Pay all outstanding shortcut */}
                  {studentSummary && studentSummary.totalPending > remaining && (
                    <button
                      className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors flex items-center gap-1"
                      onClick={() => setPayForm({ ...payForm, amount: String(Math.max(0, studentSummary.totalPending - (studentSummary.creditBalance || 0))) })}
                    >
                      <ChevronsUp className="h-3 w-3" />
                      All Arrears — PKR {studentSummary.totalPending.toLocaleString()}
                    </button>
                  )}
                </div>
                {payForm.amount && Number(payForm.amount) > 0 && selectedVoucher.netAmount > 0 && (
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.min(100, payPercent)}%` }}
                    />
                  </div>
                )}
              </div>

              {/* ── Payment method ── */}
              <div className="space-y-1.5">
                <Label>Payment Method</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PAYMENT_METHODS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setPayForm({ ...payForm, paymentMethod: value })}
                      className={`px-3 py-1.5 rounded-full text-xs border transition-all ${payForm.paymentMethod === value ? 'bg-primary text-primary-foreground border-transparent' : 'hover:bg-muted'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Remarks ── */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Remarks (optional)</Label>
                <Input
                  placeholder="e.g. Cheque #1234, receipt given…"
                  value={payForm.remarks}
                  onChange={(e) => setPayForm({ ...payForm, remarks: e.target.value })}
                  className="h-8 text-sm"
                />
              </div>

            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPayDialog(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handlePay}
              disabled={paying || bulkPaying || !payForm.amount || Number(payForm.amount) <= 0}
            >
              {(paying || bulkPaying)
                ? <><RefreshCcw className="mr-2 h-3.5 w-3.5 animate-spin" />Processing…</>
                : <><CheckCircle2 className="mr-2 h-3.5 w-3.5" />Confirm PKR {Number(payForm.amount || 0).toLocaleString()}</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Advance Payment Dialog ───────────────────────────────── */}
      <Dialog open={advanceDialog} onOpenChange={setAdvanceDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-600" /> Record Advance Payment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5">
              <p className="text-sm font-semibold text-emerald-800">
                {advanceStudent?.firstName || ''} {advanceStudent?.lastName || ''}
              </p>
              <p className="text-xs text-emerald-600">
                Payment will be stored in the credit wallet and automatically deducted from future vouchers (oldest-first).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Advance Amount (PKR) <span className="text-destructive">*</span></Label>
              <Input
                type="number" min={1}
                className="text-lg font-semibold h-11"
                placeholder="e.g. 9000"
                value={advanceForm.amount}
                onChange={(e) => setAdvanceForm({ ...advanceForm, amount: e.target.value })}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Payment Method</Label>
              <div className="flex flex-wrap gap-1.5">
                {PAYMENT_METHODS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setAdvanceForm({ ...advanceForm, paymentMethod: value })}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-all ${advanceForm.paymentMethod === value ? 'bg-primary text-primary-foreground border-transparent' : 'hover:bg-muted'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Remarks (optional)</Label>
              <Input
                placeholder="e.g. 3 months advance, cheque #1234…"
                value={advanceForm.remarks}
                onChange={(e) => setAdvanceForm({ ...advanceForm, remarks: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAdvanceDialog(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleAdvance}
              disabled={recordingAdvance || !advanceForm.amount || Number(advanceForm.amount) <= 0}
            >
              {recordingAdvance
                ? <><RefreshCcw className="mr-2 h-3.5 w-3.5 animate-spin" />Saving…</>
                : <><ArrowUpCircle className="mr-2 h-3.5 w-3.5" />Add PKR {Number(advanceForm.amount || 0).toLocaleString()} to Wallet</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New Single Voucher Dialog ─────────────────────────────────────── */}
      <Dialog open={newVoucherDialog} onOpenChange={setNewVoucherDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4 text-primary" /> Create Voucher for Student
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">

            {/* Step 1: Student search */}
            <div className="space-y-1.5">
              <Label>Student <span className="text-destructive">*</span></Label>
              {selectedStudentForVoucher ? (
                <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
                  <div>
                    <p className="font-medium text-sm">
                      {selectedStudentForVoucher.firstName} {selectedStudentForVoucher.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      #{selectedStudentForVoucher.admissionNumber} · {selectedStudentForVoucher.classId?.name || ''}
                    </p>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setSelectedStudentForVoucher(null); setNvForm(f => ({ ...f, feeItems: [] })); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    className="pl-8"
                    placeholder="Search by name or admission number…"
                    value={studentSearchTerm}
                    onChange={(e) => setStudentSearchTerm(e.target.value)}
                    autoFocus
                  />
                  {debouncedStudentSearch && (studentSearchResults?.results || []).length > 0 && (
                    <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-md overflow-hidden">
                      {(studentSearchResults?.results || []).map((s: any) => (
                        <button
                          key={s.id || s._id}
                          className="w-full text-left px-3 py-2.5 hover:bg-muted/60 transition-colors border-b last:border-0"
                          onClick={() => selectStudentForVoucher(s)}
                        >
                          <p className="text-sm font-medium">{s.firstName} {s.lastName}</p>
                          <p className="text-xs text-muted-foreground">#{s.admissionNumber} · {s.classId?.name || ''}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  {debouncedStudentSearch && debouncedStudentSearch === studentSearchTerm && !studentSearchResults?.results?.length && (
                    <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-md px-3 py-2 text-sm text-muted-foreground">
                      No students found
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Month / Year / Due Date */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Month</Label>
                <Select value={nvForm.month} onValueChange={(v) => setNvForm((f) => ({ ...f, month: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Year</Label>
                <Input type="number" min={2020} max={2099} value={nvForm.year} onChange={(e) => setNvForm((f) => ({ ...f, year: Number(e.target.value) }))} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" value={nvForm.dueDate} onChange={(e) => setNvForm((f) => ({ ...f, dueDate: e.target.value }))} className="h-9" />
              </div>
            </div>

            {/* Proration toggle (only when student selected and has monthly fee) */}
            {selectedStudentForVoucher && (selectedStudentForVoucher.feeStructure?.monthlyFee || 0) > 0 && (() => {
              const admDate = new Date();
              const totalDays = new Date(admDate.getFullYear(), admDate.getMonth() + 1, 0).getDate();
              const remainingDays = totalDays - admDate.getDate() + 1;
              const mf = selectedStudentForVoucher.feeStructure.monthlyFee;
              const prorated = Math.ceil((remainingDays / totalDays) * mf);
              return (
                <div className={`rounded-lg border p-3 space-y-1.5 ${nvForm.prorateFee ? 'border-blue-200 bg-blue-50/50' : ''}`}>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="nv-prorate"
                      checked={nvForm.prorateFee}
                      onCheckedChange={(v) => toggleProrateFee(Boolean(v))}
                    />
                    <label htmlFor="nv-prorate" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                      <Calculator className="h-3.5 w-3.5 text-blue-600" />
                      Prorate monthly fee (mid-month admission)
                    </label>
                  </div>
                  {admDate.getDate() > 1 && (
                    <p className="text-xs text-muted-foreground ml-6">
                      Today = day {admDate.getDate()} of {totalDays} · {remainingDays} days remaining ·{' '}
                      {nvForm.prorateFee
                        ? <span className="text-blue-700 font-medium">Rs. {prorated.toLocaleString()} (prorated)</span>
                        : <span>Rs. {mf.toLocaleString()} (full)</span>}
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Fee items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Fee Items</Label>
                <Button
                  type="button" size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => setNvForm((f) => ({ ...f, feeItems: [...f.feeItems, { name: '', amount: '' }] }))}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Item
                </Button>
              </div>
              {nvForm.feeItems.length === 0 && (
                <p className="text-xs text-muted-foreground py-2 text-center border rounded-lg">
                  {selectedStudentForVoucher ? 'No fee items — student may have no fee structure set.' : 'Select a student to auto-fill fee items.'}
                </p>
              )}
              {nvForm.feeItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    className="h-8 flex-1 text-sm"
                    placeholder="Fee name (e.g. Monthly Fee)"
                    value={item.name}
                    onChange={(e) => setNvForm((f) => {
                      const items = [...f.feeItems];
                      items[i] = { ...items[i], name: e.target.value };
                      return { ...f, feeItems: items };
                    })}
                  />
                  <Input
                    className="h-8 w-28 text-sm"
                    type="number" min="0" placeholder="Amount"
                    value={item.amount}
                    onChange={(e) => setNvForm((f) => {
                      const items = [...f.feeItems];
                      items[i] = { ...items[i], amount: e.target.value };
                      return { ...f, feeItems: items };
                    })}
                  />
                  <Button
                    type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setNvForm((f) => ({ ...f, feeItems: f.feeItems.filter((_, j) => j !== i) }))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {nvForm.feeItems.length > 0 && (() => {
                const subtotal = nvForm.feeItems.reduce((s, fi) => s + (Number(fi.amount) || 0), 0);
                const disc = Number(nvForm.discount) || 0;
                const net = Math.max(0, subtotal - disc);
                return (
                  <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs space-y-0.5 border">
                    <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-medium">Rs. {subtotal.toLocaleString()}</span></div>
                    {disc > 0 && <div className="flex justify-between text-emerald-600"><span>Discount</span><span>- Rs. {disc.toLocaleString()}</span></div>}
                    <div className="flex justify-between font-semibold border-t pt-1 mt-1"><span>Net Amount</span><span>Rs. {net.toLocaleString()}</span></div>
                  </div>
                );
              })()}
            </div>

            {/* Discount & Remarks */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Discount (Rs.)</Label>
                <Input type="number" min="0" placeholder="0" value={nvForm.discount} onChange={(e) => setNvForm((f) => ({ ...f, discount: e.target.value }))} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label>Remarks</Label>
                <Input placeholder="Optional" value={nvForm.remarks} onChange={(e) => setNvForm((f) => ({ ...f, remarks: e.target.value }))} className="h-9" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewVoucherDialog(false)}>Cancel</Button>
            <Button
              onClick={handleCreateVoucher}
              disabled={creatingVoucher || !selectedStudentForVoucher || nvForm.feeItems.filter(fi => fi.name && Number(fi.amount) > 0).length === 0}
            >
              {creatingVoucher
                ? <><RefreshCcw className="mr-2 h-3.5 w-3.5 animate-spin" />Creating…</>
                : <><PlusCircle className="mr-2 h-3.5 w-3.5" />Create Voucher</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Professional Print HTML (4 vouchers per A4 page, 2×2 grid) ──────────────────
function buildPrintHTML(vouchers: any[], schoolName: string, invoiceNote?: string): string {
  // Layout: 3 students per A4 page, each row = Student Copy (left) | cut | Office Copy (right)
  const PER_PAGE = 3;
  const pages: string[] = [];
  for (let i = 0; i < vouchers.length; i += PER_PAGE) {
    const group = vouchers.slice(i, i + PER_PAGE);
    const rows = group.map((v, ri) => `
      <div class="row${ri < group.length - 1 ? ' has-cut' : ''}">
        <div class="half">${voucherCopyHTML(v, schoolName, 'Student Copy', invoiceNote)}</div>
        <div class="vcut"><span>✂</span></div>
        <div class="half">${voucherCopyHTML(v, schoolName, 'Office Copy', invoiceNote)}</div>
      </div>`).join('');
    pages.push(`<div class="page">${rows}</div>`);
  }
  const pageHTML = pages.join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Fee Vouchers — ${schoolName}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: #fff; color: #000; font-size: 9px; }

  /* ── A4 Page ─────────────────────────── */
  .page {
    width: 210mm;
    padding: 5mm 6mm;
    page-break-after: always;
  }
  .page:last-child { page-break-after: auto; }

  /* ── Student row (one student = 2 copies) */
  .row {
    display: flex;
    align-items: stretch;
  }
  .row.has-cut {
    border-bottom: 1.5px dashed #666;
    padding-bottom: 2.5mm;
    margin-bottom: 2.5mm;
  }

  /* ── Half (one copy) ──────────────────── */
  .half { flex: 1; display: flex; }

  /* ── Vertical cut line between copies ── */
  .vcut {
    width: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-left: 1.5px dashed #666;
    border-right: 1.5px dashed #666;
    flex-shrink: 0;
    font-size: 8px;
    color: #555;
    writing-mode: vertical-rl;
    letter-spacing: 3px;
  }

  /* ── Voucher card ─────────────────────── */
  .vc {
    width: 100%;
    border: 1.5px solid #000;
    display: flex;
    flex-direction: column;
    font-size: 8.5px;
  }

  /* ── Header ───────────────────────────── */
  .vc-head {
    text-align: center;
    border-bottom: 1px solid #000;
    padding: 3px 4px 2px;
  }
  .vc-school {
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    line-height: 1.2;
  }
  .vc-title {
    font-size: 9px;
    font-weight: 700;
    border-top: 1px solid #000;
    border-bottom: 1px solid #000;
    padding: 2px 0;
    margin: 2px 0 1px;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .vc-sub { font-size: 7.5px; }

  /* ── Info rows ────────────────────────── */
  .vc-info { width: 100%; border-collapse: collapse; }
  .vc-info td {
    padding: 2px 5px;
    border-bottom: 1px solid #ddd;
    vertical-align: middle;
    font-size: 8.5px;
  }
  .vc-info .lbl { color: #000; font-size: 7.5px; white-space: nowrap; padding-right: 2px; }
  .vc-info .val { border-bottom: 1px dotted #555; font-weight: 700; }
  .vc-info .sep { width: 4px; }

  /* ── Fee items table ──────────────────── */
  .vc-fee { width: 100%; border-collapse: collapse; }
  .vc-fee thead tr { background: #efefef; }
  .vc-fee th {
    padding: 3px 5px;
    font-size: 7.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border: 1px solid #bbb;
    text-align: left;
  }
  .vc-fee th.r, .vc-fee td.r { text-align: right; }
  .vc-fee td {
    padding: 2.5px 5px;
    font-size: 8.5px;
    border: 1px solid #ddd;
  }
  .vc-fee td.sno { text-align: center; width: 18px; color: #555; font-size: 7.5px; }
  .vc-fee td.r { font-weight: 600; width: 30%; }

  /* ── Totals ───────────────────────────── */
  .vc-total { width: 100%; border-collapse: collapse; border-top: 2px solid #000; }
  .vc-total td { padding: 3px 5px; font-size: 9px; }
  .vc-total td.tlbl { width: 70%; font-weight: 600; }
  .vc-total td.tamt { text-align: right; font-weight: 800; font-size: 10px; }

  /* ── PAID stamp (B&W) ─────────────────── */
  .paid-stamp {
    text-align: center;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 3px;
    border: 2px solid #000;
    padding: 1px 6px;
    display: inline-block;
    margin: 2px auto;
  }

  /* ── Signature row ────────────────────── */
  .vc-sigs {
    display: flex;
    justify-content: space-between;
    padding: 3px 5px 2px;
    font-size: 7px;
    border-top: 1px solid #aaa;
    margin-top: auto;
  }

  /* ── Copy label ───────────────────────── */
  .vc-copy-label {
    text-align: center;
    font-weight: 800;
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    padding: 2px 0;
    border-top: 1.5px solid #000;
    background: #efefef;
  }

  .vc-note {
    text-align: center;
    font-size: 7px;
    line-height: 1.35;
    padding: 3px 4px 2px;
    border-top: 1px dashed #888;
    white-space: normal;
    word-break: break-word;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { size: A4 portrait; margin: 0; }
  }
</style>
</head>
<body>
${pageHTML}
</body>
</html>`;
}

function voucherCopyHTML(v: any, schoolName: string, copyLabel: string, invoiceNote?: string): string {
  const feeItems: any[] = v.feeItems || [];
  const feeTotal = feeItems.reduce((s: number, fi: any) => s + (fi.amount || 0), 0);
  const discount = v.discount || 0;
  const fine = v.fine || 0;
  const netPayable = v.netAmount && v.netAmount > 0 ? v.netAmount : feeTotal - discount + fine;

  const dueDate = v.dueDate
    ? new Date(v.dueDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
  const session = `${v.year || ''}–${(v.year || 0) + 1}`;

  const itemRows = feeItems
    .map(
      (fi: any, i: number) =>
        `<tr>
          <td class="sno">${i + 1}</td>
          <td>${fi.name}</td>
          <td class="r">${(fi.amount || 0).toLocaleString()}/-</td>
        </tr>`,
    )
    .join('');

  const discountRow =
    discount > 0
      ? `<tr><td class="sno"></td><td>Scholarship / Discount</td><td class="r">(${discount.toLocaleString()}/-)</td></tr>`
      : '';
  const fineRow =
    fine > 0
      ? `<tr><td class="sno"></td><td>Late Fine</td><td class="r">${fine.toLocaleString()}/-</td></tr>`
      : '';

  const paidStamp =
    v.status === 'paid'
      ? `<tr><td colspan="3" style="text-align:center;padding:2px 0"><span class="paid-stamp">PAID</span></td></tr>`
      : '';

  const paidRows =
    (v.paidAmount || 0) > 0 && v.status !== 'paid'
      ? `<tr><td class="tlbl" style="font-size:8px;font-weight:400">Amount Received</td>
           <td class="tamt" style="font-size:9px">${(v.paidAmount || 0).toLocaleString()}/-</td></tr>
         <tr><td class="tlbl" style="font-size:8px;font-weight:400">Balance Due</td>
           <td class="tamt" style="font-size:9px">${Math.max(0, netPayable - (v.paidAmount || 0)).toLocaleString()}/-</td></tr>`
      : '';

  return `<div class="vc">
  <div class="vc-head">
    <div class="vc-school">${schoolName}</div>
    <div class="vc-title">${v.isAdvanceProjection ? 'Advance Fee Receipt' : 'Fee Challan Voucher'}</div>
    <div class="vc-sub">${v.isAdvanceProjection ? '<span style="font-weight:600">Paid in advance</span> · ' : ''}Month: <b>${v.month || '—'} ${v.year || ''}</b> &nbsp;&nbsp; Session: <b>${session}</b></div>
  </div>
  <table class="vc-info">
    <tr>
      <td class="lbl">Voucher#</td>
      <td class="val">${v.voucherNumber || '—'}</td>
      <td class="sep"></td>
      <td class="lbl">Due Date</td>
      <td class="val">${dueDate}</td>
    </tr>
    <tr>
      <td class="lbl">Name</td>
      <td class="val" colspan="4">${v.studentId?.firstName || ''} ${v.studentId?.lastName || ''}</td>
    </tr>
    <tr>
      <td class="lbl">Adm #</td>
      <td class="val">${v.studentId?.admissionNumber || '—'}</td>
      <td class="sep"></td>
      <td class="lbl">Class</td>
      <td class="val">${v.classId?.name || '—'}${v.sectionId?.name ? ' / ' + v.sectionId.name : ''}</td>
    </tr>
  </table>
  <table class="vc-fee">
    <thead>
      <tr>
        <th style="width:18px;text-align:center">#</th>
        <th>Description</th>
        <th class="r" style="width:28%">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
      ${discountRow}
      ${fineRow}
      ${paidStamp}
    </tbody>
  </table>
  <table class="vc-total">
    ${paidRows}
    <tr>
      <td class="tlbl">Total (Rs.):</td>
      <td class="tamt">${netPayable.toLocaleString()}/-</td>
    </tr>
  </table>
  <div class="vc-sigs">
    <span>Issued by: ___________</span>
    <span>Checked by: ___________</span>
    <span>Counter Signed by: ___________</span>
  </div>
  ${invoiceNote?.trim() ? `<div class="vc-note">${invoiceNoteToSafeHtml(invoiceNote)}</div>` : ''}
  <div class="vc-copy-label">${copyLabel}</div>
</div>`;
}



