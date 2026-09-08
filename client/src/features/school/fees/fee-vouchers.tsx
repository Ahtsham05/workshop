import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Printer, Zap, DollarSign, Search, CheckCircle2, Clock, AlertTriangle, RefreshCcw, X, History, CalendarCheck, Wrench, Wallet, ArrowUpCircle, ChevronsUp, ChevronDown, ChevronRight, PlusCircle, Trash2, Plus, Calculator } from 'lucide-react';
import {
  useGetFeeVouchersQuery,
  useGetSchoolClassesQuery,
  useGetFeeStructuresQuery,
  useBulkGenerateFeeVouchersMutation,
  useGetFeeVouchersForPrintMutation,
  useGetStudentFeeSummaryQuery,
  useGetStudentFeeLedgerQuery,
  useReconcileFeeVouchersMutation,
  useBulkPayStudentFeeVouchersMutation,
  useRecordStudentAdvancePaymentMutation,
  useGetStudentBalancesQuery,
  useGetReceivableSummaryQuery,
  useCreateFeeVoucherMutation,
  useGetStudentsQuery,
  useBulkDeleteFeeVouchersMutation,
  useClearOrphanCreditWalletsMutation,
} from '@/stores/school.api';
import { useGetMyOrganizationQuery } from '@/stores/organization.api';
import { useGetBranchQuery } from '@/stores/branch.api';
import { invoiceNoteToSafeHtml, escapeHtml } from '@/lib/escape-html';
import { useFormatMoney, useCurrencyMeta, FALLBACK_CURRENCY } from '@/lib/format-money';
import { useSelector } from 'react-redux';
import { RootState } from '@/stores/store';
import { toast } from 'sonner';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

type MonthOption = { id: string; month: string; year: number; status: string; remaining: number; label: string };

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

/** Label a fee line item with its billing month */
function feeItemLabel(name: string, month?: string, year?: number | string): string {
  const base = String(name || 'Fee').trim();
  const period = month && year ? `${month} ${year}` : month || '';
  if (!period) return base;
  if (base.toLowerCase().includes(String(month || '').toLowerCase())) return base;
  if (/monthly|tuition|transport|fee/i.test(base)) return `${base} — ${period}`;
  return `${base} (${period})`;
}

/** Short "12-Aug" style date for a paid-tag badge — day and month only, no year,
 * since the challan header already states the session/year. */
function formatDayMonth(date?: string | Date | null): string {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  return `${day}-${month}`;
}

/** Tags one voucher document's OWN fee items (PAID / PARTIAL / PENDING) using that
 * document's own status/paidAmount — kept per-document so a merged multi-fund challan
 * (see mergeVoucherGroupForPrint) tags each fund by its own status, never a sibling's. */
function buildOwnFundRows(doc: any): { name: string; amount: number; tagText: string; tagClass: string; rowClass: string; paidAmt: number; dateLabel?: string }[] {
  const ownItems: { name: string; amount: number }[] = (doc.feeItems || []).map((fi: any) => ({
    name: feeItemLabel(fi.name, doc.month, doc.year),
    amount: fi.amount || 0,
  }));
  const paidDateLabel = formatDayMonth(doc.paidDate);
  let pool = doc.status === 'partial' ? Number(doc.paidAmount || 0) : 0;
  return ownItems.map((fi) => {
    if (doc.status === 'paid') {
      return { ...fi, tagText: doc.paidThisTransaction ? 'RECEIVED' : 'PAID', tagClass: 'received-tag', rowClass: ' class="received-row"', paidAmt: fi.amount || 0, dateLabel: paidDateLabel };
    }
    if (doc.status === 'partial') {
      const paidAmt = Math.min(fi.amount || 0, Math.max(0, pool));
      pool -= paidAmt;
      return { ...fi, tagText: 'PARTIAL', tagClass: 'pending-tag', rowClass: ' class="pending-row"', paidAmt, dateLabel: paidAmt > 0 ? paidDateLabel : undefined };
    }
    return { ...fi, tagText: 'PENDING', tagClass: 'pending-tag', rowClass: ' class="pending-row"', paidAmt: 0 };
  });
}

/** Same student + same month/year vouchers from different funds (e.g. tuition +
 * "Paper Fund") print as ONE combined challan rather than one per fund — each fund's
 * own line keeps its own PAID/PENDING tag, and shared arrears (from the first member,
 * already deduped server-side against the rest of this print batch) appear once. */
function mergeVoucherGroupForPrint(group: any[]): any {
  if (group.length <= 1) return group[0];
  const base = group[0];
  const netAmount = group.reduce((s, g) => s + (g.netAmount || 0), 0);
  const paidAmount = group.reduce((s, g) => s + (g.paidAmount || 0), 0);
  const discount = group.reduce((s, g) => s + (g.discount || 0), 0);
  const fine = group.reduce((s, g) => s + (g.fine || 0), 0);
  const allPaid = group.every((g) => g.status === 'paid');
  const nonePaid = group.every((g) => (g.paidAmount || 0) <= 0);
  const status = allPaid ? 'paid' : nonePaid ? (group.some((g) => g.status === 'overdue') ? 'overdue' : 'unpaid') : 'partial';
  const dueDate = group.reduce((earliest: string | null, g) =>
    !earliest || (g.dueDate && g.dueDate < earliest) ? g.dueDate : earliest, null as string | null);
  const paidDates = group.map((g) => g.paidDate).filter(Boolean).sort();

  return {
    ...base,
    feeItems: group.flatMap((g) => g.feeItems || []),
    netAmount, paidAmount, discount, fine, status,
    dueDate: dueDate || base.dueDate,
    paidDate: paidDates.length ? paidDates[paidDates.length - 1] : undefined,
    voucherNumber: group.map((g) => g.voucherNumber).filter(Boolean).join(' / '),
    ownFundRows: group.flatMap((g) => buildOwnFundRows(g)),
  };
}

/** Groups a flat print batch by student + month/year — mirrors the on-screen row
 * grouping — then merges each group into a single challan (see above). */
function groupPrintVouchers(list: any[]): any[] {
  const map = new Map<string, any[]>();
  list.forEach((v: any) => {
    const sid = v.studentId?.id || v.studentId?._id || v.studentId;
    const key = `${sid}_${v.month}_${v.year}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(v);
  });
  return Array.from(map.values()).map((group) => mergeVoucherGroupForPrint(group));
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
  const formatMoney = useFormatMoney();
  const { symbol: currencySymbol } = useCurrencyMeta();

  const [filters, setFilters] = useState({
    month: MONTHS[now.getMonth()],
    year: now.getFullYear(),
    classId: 'all',
    status: 'all',
    voucherType: 'all',
    search: '',
    page: 1,
    limit: 25,
  });
  const [searchInput, setSearchInput] = useState('');
  const [generateDialog, setGenerateDialog] = useState(false);
  const [printLayout, setPrintLayout] = useState<'auto' | 'large' | 'medium' | 'compact'>('auto');
  const [printArrearsMode, setPrintArrearsMode] = useState<'with_arrears' | 'month_only'>('with_arrears');
  const [rowsPerPage, setRowsPerPage] = useState<'auto' | '2' | '3' | '4' | '5' | '6'>('auto');
  const [payDialog, setPayDialog] = useState(false);
  const [advanceDialog, setAdvanceDialog] = useState(false);
  const [advanceStudent, setAdvanceStudent] = useState<any>(null);
  const [advanceForm, setAdvanceForm] = useState({ amount: '', paymentMethod: 'cash', remarks: '' });
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [payForm, setPayForm] = useState({ amount: '', paymentMethod: 'cash', remarks: '' });
  /** Which pending month(s)/voucher(s) the user has explicitly chosen to collect for in the Pay dialog */
  const [selectedMonthIds, setSelectedMonthIds] = useState<string[]>([]);
  const [genForm, setGenForm] = useState({
    classIds: [] as string[], feeStructureId: '', fundName: '',
    month: MONTHS[now.getMonth()], year: now.getFullYear(),
    feeSource: 'admission_form' as 'admission_form' | 'fee_structure' | 'mixed',
  });

  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100 });
  const { data: structuresData } = useGetFeeStructuresQuery({ limit: 200 });
  const allStructures = structuresData?.results || [];
  // Structures belonging to any of the currently-selected classes — a class can have
  // several simultaneously-active structures, one per fund (e.g. "Standard Fee
  // Structure" for tuition plus a separate "Paper Fund").
  const structuresForSelectedClasses = allStructures.filter((s: any) =>
    genForm.classIds.includes(s.classId?.id || s.classId)
  );
  // Single selected class: pick a specific structure document (existing behaviour).
  const structures = genForm.classIds.length === 1 ? structuresForSelectedClasses : [];
  // Multiple selected classes: pick a fund by NAME instead — each class's own
  // matching-named structure is resolved server-side.
  const fundNameOptions = Array.from(
    new Set(structuresForSelectedClasses.map((s: any) => s.name).filter(Boolean))
  ) as string[];

  const voucherParams: any = {
    page: filters.page, limit: filters.limit,
    month: filters.month, year: filters.year,
  };
  if (filters.classId !== 'all') voucherParams.classId = filters.classId;
  if (filters.status !== 'all') voucherParams.status = filters.status;
  if (filters.voucherType !== 'all') voucherParams.voucherType = filters.voucherType;
  if (filters.search) voucherParams.search = filters.search;

  const { data: vouchersData, isLoading, isFetching } = useGetFeeVouchersQuery(voucherParams);
  const [bulkGenerate, { isLoading: generating }] = useBulkGenerateFeeVouchersMutation();
  const [bulkPay, { isLoading: bulkPaying }] = useBulkPayStudentFeeVouchersMutation();
  const [recordAdvance, { isLoading: recordingAdvance }] = useRecordStudentAdvancePaymentMutation();
  const [getForPrint, { isLoading: loadingPrint }] = useGetFeeVouchersForPrintMutation();
  const [reconcile, { isLoading: reconciling }] = useReconcileFeeVouchersMutation();
  const [bulkDeleteVouchers, { isLoading: deletingVouchers }] = useBulkDeleteFeeVouchersMutation();
  const [clearCreditWallets, { isLoading: clearingWallets }] = useClearOrphanCreditWalletsMutation();
  const [createVoucher, { isLoading: creatingVoucher }] = useCreateFeeVoucherMutation();

  // ── New voucher dialog state ──────────────────────────────────────────────
  const [newVoucherDialog, setNewVoucherDialog] = useState(false);
  const [ledgerDialog, setLedgerDialog] = useState(false);
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
  const { data: studentLedger, isLoading: loadingLedger } = useGetStudentFeeLedgerQuery(
    summaryStudentId,
    { skip: !ledgerDialog || !summaryStudentId },
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

  useEffect(() => {
    const timer = setTimeout(() => {
      const normalized = searchInput.trim();
      setFilters((prev) => {
        if (prev.search === normalized) return prev;
        return { ...prev, search: normalized, page: 1 };
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

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

  const toggleGenClassSelection = (classId: string, checked: boolean) => {
    setGenForm((prev) => ({
      ...prev,
      classIds: checked
        ? prev.classIds.includes(classId) ? prev.classIds : [...prev.classIds, classId]
        : prev.classIds.filter((id) => id !== classId),
      feeStructureId: '',
      fundName: '',
    }));
  };
  const selectAllGenClasses = (checked: boolean) => {
    setGenForm((prev) => ({
      ...prev,
      classIds: checked ? classes.map((c: any) => c.id) : [],
      feeStructureId: '',
      fundName: '',
    }));
  };

  const genClassCount = genForm.classIds.length;
  const genNeedsStructurePick = genForm.feeSource !== 'admission_form';
  const genStructureMissing = genNeedsStructurePick && (
    genClassCount === 1 ? !genForm.feeStructureId : !genForm.fundName
  );

  const handleGenerate = async () => {
    if (!genClassCount) return toast.error('Select at least one class');
    if (genStructureMissing) {
      return toast.error(genClassCount === 1 ? 'Select a fee structure' : 'Select a voucher category');
    }
    try {
      const payload: any = {
        month: genForm.month,
        year: genForm.year,
        feeSource: genForm.feeSource,
      };
      if (genClassCount === 1) {
        payload.classId = genForm.classIds[0];
        if (genForm.feeStructureId) payload.feeStructureId = genForm.feeStructureId;
      } else {
        payload.classIds = genForm.classIds;
        if (genForm.fundName) payload.fundName = genForm.fundName;
      }
      const result = await bulkGenerate(payload).unwrap();
      const skipped = result.skipped ? ` · ${result.skipped} skipped (no fees)` : '';
      const dups = result.skippedDuplicates ? ` · ${result.skippedDuplicates} already covered for this period` : '';
      const autoApplied = result.autoAppliedCount
        ? ` · ${result.autoAppliedCount} auto-paid from wallet (${formatMoney(result.autoAppliedAmount || 0)})`
        : '';
      toast.success(`Generated ${result.generated} / ${result.total} vouchers${skipped}${dups}${autoApplied}`);
      setGenerateDialog(false);
      setGenForm({ classIds: [], feeStructureId: '', fundName: '', month: MONTHS[now.getMonth()], year: now.getFullYear(), feeSource: 'admission_form' });
    } catch (err: any) { toast.error(err?.data?.message || 'Generation failed'); }
  };

  const openPay = (v: any) => {
    setSelectedVoucher(v);
    const remaining = Math.max(0, vNet(v) - (v.paidAmount || 0));
    // Default selection: just the clicked voucher's own month — explicit, no guessing.
    // The user can add more months (or switch to "All Arrears") from the checklist below.
    setSelectedMonthIds([v.id || v._id]);
    setPayForm({ amount: String(remaining), paymentMethod: 'cash', remarks: '' });
    setPayDialog(true);
  };

  const handlePay = async () => {
    if (!selectedVoucher || !payForm.amount || Number(payForm.amount) <= 0) {
      return toast.error('Enter a valid amount');
    }
    if (!selectedMonthIds.length) {
      return toast.error('Select which month(s) you are collecting fee for');
    }
    const amountToPay = Number(payForm.amount);
    try {
      // Always pay against the explicit month(s)/voucher(s) the user checked —
      // never let the server silently guess which month an amount belongs to.
      const result = await bulkPay({
        studentId: summaryStudentId,
        amount: amountToPay,
        paymentMethod: payForm.paymentMethod,
        remarks: payForm.remarks,
        voucherIds: selectedMonthIds,
      }).unwrap();
      const paidList = result?.vouchersPaid || [];
      const count = paidList.length;
      const newCredit = result?.newCreditBalance ?? 0;
      const excessDeposited = Number(result?.excessDeposited ?? 0);
      const monthsLabel = paidList.map((x: any) => `${x.month} ${x.year}`).join(', ');
      let msg = count
        ? `${formatMoney(amountToPay)} received for ${monthsLabel}`
        : `${formatMoney(amountToPay)} processed`;
      if (newCredit > 0) msg += ` · ${formatMoney(newCredit)} saved to credit wallet`;

      const ids = paidList
        .map((x: any) => x?.voucherId)
        .filter(Boolean)
        .map((id: any) => (typeof id === 'string' ? id : id?.toString?.() ?? ''))
        .filter(Boolean);
      let printRows: any[] = [];
      let receiptData: any = null;
      if (ids.length) {
        try {
          const rawRows = await getForPrint({ ids, includeArrears: true }).unwrap();
          // Stamp each just-paid voucher with what THIS payment covered, so the
          // printed receipt can say exactly which month(s) it was received for —
          // instead of leaving it ambiguous alongside other listed arrears.
          const paidByVoucherId = new Map<string, any>(paidList.map((x: any) => [String(x.voucherId), x]));
          printRows = rawRows.map((r: any) => {
            const info = paidByVoucherId.get(String(r.id || r._id));
            return info
              ? {
                  ...r,
                  paidThisTransaction: true,
                  amountPaidNow: info.applied,
                  paidMonthsCount: count,
                  paidMonthsLabel: monthsLabel,
                }
              : r;
          });

          // Build the standalone Payment Received Voucher (receipt) — kept separate from
          // the Fee Challan reprint above; offered via the "Print Receipt" toast action
          // (and reprintable later from the Student Fee Ledger) rather than auto-printed.
          const primary = rawRows[0];
          receiptData = {
            receiptNumber: `RCP-${Date.now()}`,
            paidDate: primary?.paidDate || new Date().toISOString(),
            studentName: `${primary?.studentId?.firstName || ''} ${primary?.studentId?.lastName || ''}`.trim(),
            fatherName: primary?.studentId?.parent?.fatherName || primary?.studentId?.parent?.guardianName || '—',
            admissionNumber: primary?.studentId?.admissionNumber || '—',
            rollNumber: primary?.studentId?.rollNumber || '—',
            studentUserId: primary?.studentId?.studentUserId || '—',
            className: `${primary?.classId?.name || ''}${primary?.sectionId?.name ? ' / ' + primary.sectionId.name : ''}`,
            paymentMethod: payForm.paymentMethod,
            remarks: payForm.remarks,
            items: paidList.map((x: any) => {
              const match = rawRows.find((r: any) => String(r.id || r._id) === String(x.voucherId));
              const label = match?.feeItems?.length === 1
                ? feeItemLabel(match.feeItems[0].name, x.month, x.year)
                : feeItemLabel('Fee', x.month, x.year);
              return { label, amount: Number(x.applied || 0) };
            }),
            totalAmount: amountToPay,
          };
        } catch {
          toast.error('Payment saved but print preview failed to load');
        }
      }

      toast.success(
        msg,
        receiptData
          ? { action: { label: 'Print Receipt', onClick: () => openReceiptPrintWindow(receiptData) }, duration: 8000 }
          : undefined
      );

      if (excessDeposited > 0) {
        const studentRow = selectedVoucher?.studentId;
        const monthlyFee = estimateMonthlyFee(selectedVoucher, studentSummary, studentRow);
        const paidMonths = paidList.map((x: any) => ({
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
      toast.success(`${formatMoney(amountNum)} added to credit wallet. New balance: ${formatMoney(result.creditBalance || 0)}`);
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

  const toggleSelectAll = () => {
    if (selectedIds.length === vouchers.length) setSelectedIds([]);
    else setSelectedIds(vouchers.map((v: any) => v.id));
  };
  const toggleSelectGroup = (ids: string[]) => {
    const allSelected = ids.every((id) => selectedIds.includes(id));
    setSelectedIds((prev) => allSelected
      ? prev.filter((id) => !ids.includes(id))
      : [...new Set([...prev, ...ids])]
    );
  };

  const STATUS_PRIORITY = ['overdue', 'unpaid', 'partial', 'paid', 'cancelled'];
  const worstStatus = (list: any[]) => list.reduce(
    (worst, x) => STATUS_PRIORITY.indexOf(x.status) < STATUS_PRIORITY.indexOf(worst) ? x.status : worst,
    list[0].status
  );

  // Same student + same month/year vouchers from different funds (e.g. tuition +
  // "Paper Fund") aren't duplicates — group them into one row, with the individual
  // funds shown only when expanded.
  const voucherGroups = useMemo(() => {
    const map = new Map<string, any[]>();
    vouchers.forEach((v: any) => {
      const sid = v.studentId?.id || v.studentId?._id || v.studentId;
      const key = `${sid}_${v.month}_${v.year}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    });
    return Array.from(map.values());
  }, [vouchers]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const toggleGroupExpand = (key: string) => {
    setExpandedGroups((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  /** `statusFilter` splits a bulk print into two independent actions — "Print Paid Vouchers"
   * (receipts for what's already settled) vs. "Print Fee Vouchers" (bills still owed) — so
   * a single batch never mixes settled and outstanding vouchers together. Per-voucher/group
   * print buttons pass an explicit `voucherId` and skip this filter entirely. */
  const handlePrint = async (
    overrideVouchers?: any[],
    voucherId?: string | string[],
    statusFilter?: 'paid' | 'pending'
  ) => {
    if (overrideVouchers) {
      openPrintWindow(overrideVouchers);
      return;
    }
    const includeArrears = printArrearsMode === 'with_arrears';
    const voucherIds = Array.isArray(voucherId) ? voucherId : voucherId ? [voucherId] : null;
    const baseVouchers = voucherIds
      ? vouchers.filter((v: any) => voucherIds.includes(v.id))
      : selectedIds.length
        ? vouchers.filter((v: any) => selectedIds.includes(v.id))
        : vouchers;
    const printableVouchers =
      statusFilter === 'paid'
        ? baseVouchers.filter((v: any) => v.status === 'paid')
        : statusFilter === 'pending'
          ? baseVouchers.filter((v: any) => v.status !== 'paid')
          : baseVouchers;
    const ids = printableVouchers.map((v: any) => v.id);
    if (!ids.length) {
      return toast.error(
        statusFilter === 'paid'
          ? 'No paid vouchers to print'
          : statusFilter === 'pending'
            ? 'No pending fee vouchers to print'
            : 'No vouchers to print'
      );
    }
    try {
      const data = await getForPrint({ ids, includeArrears }).unwrap();
      if (statusFilter && !voucherIds) {
        const skipped = baseVouchers.length - printableVouchers.length;
        if (skipped > 0) {
          const skippedLabel = statusFilter === 'paid' ? 'unpaid' : 'paid';
          toast.info(`Skipped ${skipped} ${skippedLabel} voucher${skipped > 1 ? 's' : ''}`);
        }
      }
      openPrintWindow(data);
    } catch { toast.error('Could not load print data'); }
  };

  const handleReconcile = async () => {
    try {
      const res = await reconcile(undefined).unwrap();
      toast.success(`Fixed ${res.fixed} voucher(s)${res.failed ? ` · ${res.failed} failed` : ''}`);
    } catch { toast.error('Reconcile failed'); }
  };

  const deleteTargetCount = selectedIds.length || vouchersData?.totalResults || 0;
  const deleteTargetLabel = selectedIds.length
    ? `${selectedIds.length} selected voucher${selectedIds.length !== 1 ? 's' : ''}`
    : `${vouchersData?.totalResults || 0} voucher${(vouchersData?.totalResults || 0) !== 1 ? 's' : ''}`;

  const activeFilterParts = [
    `${filters.month} ${filters.year}`,
    filters.classId !== 'all' ? classes.find((c: any) => c.id === filters.classId)?.name || 'Selected class' : null,
    filters.status !== 'all' ? filters.status : null,
    filters.voucherType !== 'all' ? filters.voucherType : null,
    filters.search ? `search "${filters.search}"` : null,
  ].filter(Boolean);

  const handleBulkDelete = async () => {
    if (!deleteTargetCount) return toast.error('No vouchers to delete');
    try {
      const payload = selectedIds.length
        ? { ids: selectedIds }
        : {
            deleteAllMatching: true,
            month: filters.month,
            year: filters.year,
            ...(filters.classId !== 'all' ? { classId: filters.classId } : {}),
            ...(filters.status !== 'all' ? { status: filters.status } : {}),
            ...(filters.voucherType !== 'all' ? { voucherType: filters.voucherType } : {}),
            ...(filters.search ? { search: filters.search } : {}),
          };
      const res = await bulkDeleteVouchers(payload).unwrap();
      let msg = `Deleted ${res.deletedVouchers} voucher${res.deletedVouchers !== 1 ? 's' : ''}`;
      if (res.clearedCreditAmount) {
        msg += ` · Cleared ${formatMoney(res.clearedCreditAmount)} from wallet(s)`;
      }
      toast.success(msg);
      setSelectedIds([]);
    } catch (err: any) {
      toast.error(err?.data?.message || 'Could not delete vouchers');
    }
  };

  const handleClearWallets = async () => {
    try {
      const res = await clearCreditWallets(
        filters.classId !== 'all' ? { classId: filters.classId } : undefined,
      ).unwrap();
      if (res.clearedCreditAmount) {
        toast.success(`Cleared ${formatMoney(res.clearedCreditAmount)} from ${res.resetStudents} wallet(s)`);
      } else {
        toast.info('No orphan credit wallets to clear');
      }
    } catch (err: any) {
      toast.error(err?.data?.message || 'Could not clear wallets');
    }
  };

  const openPrintWindow = (data: any[]) => {
    const win = window.open('', '_blank');
    if (!win) return toast.error('Allow pop-ups to print');
    win.document.write(
      buildPrintHTML(groupPrintVouchers(data), org?.name || 'School', branchData?.invoiceNote, {
        layout: printLayout,
        rowsPerPage,
      }, currencySymbol)
    );
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 600);
  };

  /** Prints a "Payment Received Voucher" receipt for a single collection — separate
   * from the Fee Challan above, triggered manually (not auto-fired on every payment). */
  const openReceiptPrintWindow = (payment: any) => {
    const win = window.open('', '_blank');
    if (!win) return toast.error('Allow pop-ups to print');
    win.document.write(buildReceiptPrintHTML(payment, org?.name || 'School', currencySymbol));
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 600);
  };

  const svNet = selectedVoucher ? vNet(selectedVoucher) : 0;
  const remaining = selectedVoucher ? Math.max(0, svNet - (selectedVoucher.paidAmount || 0)) : 0;

  /** Short fund label for a voucher's line items — lets same-month vouchers from
   * different funds (e.g. tuition vs. "Paper Fund") read as distinct rows. */
  const voucherFundLabel = (feeItems: { name: string }[] = []): string => {
    if (!feeItems.length) return '';
    if (feeItems.length === 1) return feeItems[0].name;
    const names = feeItems.map((fi) => fi.name);
    return names.length <= 2 ? names.join(' + ') : `${names[0]} +${names.length - 1} more`;
  };

  // Selectable months for the Pay dialog — the student's pending vouchers, always
  // including the one that was clicked (in case the summary hasn't loaded/refreshed yet).
  const monthOptions: MonthOption[] = useMemo(() => {
    const list: MonthOption[] = (studentSummary?.pendingVouchers || []).map((pv: any) => ({
      id: pv.id,
      month: pv.month,
      year: Number(pv.year),
      status: pv.status,
      remaining: Number(pv.remaining || 0),
      label: voucherFundLabel(pv.feeItems),
    }));
    if (selectedVoucher) {
      const svId = selectedVoucher.id || selectedVoucher._id;
      if (!list.some((m) => m.id === svId)) {
        list.push({
          id: svId, month: selectedVoucher.month, year: Number(selectedVoucher.year),
          status: selectedVoucher.status, remaining, label: voucherFundLabel(selectedVoucher.feeItems),
        });
      }
    }
    return list.sort((a, b) => (a.year - b.year) || (MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month)));
  }, [studentSummary, selectedVoucher, remaining]);

  const selectedMonthsTotal = monthOptions
    .filter((m) => selectedMonthIds.includes(m.id))
    .reduce((s, m) => s + m.remaining, 0);

  /** Update which months are checked AND auto-fill Amount Paying with their combined total. */
  const applyMonthSelection = (ids: string[]) => {
    setSelectedMonthIds(ids);
    const total = monthOptions.filter((m) => ids.includes(m.id)).reduce((s, m) => s + m.remaining, 0);
    setPayForm((f) => ({ ...f, amount: String(total) }));
  };
  const toggleMonthSelect = (id: string) => {
    applyMonthSelection(
      selectedMonthIds.includes(id) ? selectedMonthIds.filter((x) => x !== id) : [...selectedMonthIds, id]
    );
  };
  const selectThisMonthOnly = () => {
    if (selectedVoucher) applyMonthSelection([selectedVoucher.id || selectedVoucher._id]);
  };
  const selectAllArrearsMonths = () => applyMonthSelection(monthOptions.map((m) => m.id));

  const quickPayFull = selectedMonthsTotal;
  const payPercent = quickPayFull > 0
    ? Math.min(100, Math.round((Number(payForm.amount) / quickPayFull) * 100))
    : 0;

  // Counts behind the two separate print buttons — respects the current row selection
  // (if any) so the button labels always match what a click will actually print.
  const printScopeVouchers = selectedIds.length ? vouchers.filter((v: any) => selectedIds.includes(v.id)) : vouchers;
  const paidPrintCount = printScopeVouchers.filter((v: any) => v.status === 'paid').length;
  const pendingPrintCount = printScopeVouchers.filter((v: any) => v.status !== 'paid').length;

  return (
    <div className="h-full w-full p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fee Vouchers</h1>
          <p className="text-sm text-muted-foreground">Generate, collect and print monthly fee vouchers</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={printArrearsMode} onValueChange={(v: 'with_arrears' | 'month_only') => setPrintArrearsMode(v)}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Print content" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="with_arrears">With Arrears</SelectItem>
              <SelectItem value="month_only">This Month Only</SelectItem>
            </SelectContent>
          </Select>
          {(selectedIds.length > 0 || vouchers.length > 0) && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePrint(undefined, undefined, 'pending')}
                disabled={loadingPrint || pendingPrintCount === 0}
                title="Print unpaid / partially-paid fee vouchers only"
              >
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Print Fee Vouchers ({pendingPrintCount})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePrint(undefined, undefined, 'paid')}
                disabled={loadingPrint || paidPrintCount === 0}
                title="Print already-paid vouchers only (receipts)"
              >
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Print Paid Vouchers ({paidPrintCount})
              </Button>
            </>
          )}
          <Select value={printLayout} onValueChange={(v: any) => setPrintLayout(v)}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Print Size" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Size: Auto</SelectItem>
              <SelectItem value="large">Size: Large</SelectItem>
              <SelectItem value="medium">Size: Medium</SelectItem>
              <SelectItem value="compact">Size: Compact</SelectItem>
            </SelectContent>
          </Select>
          <Select value={rowsPerPage} onValueChange={(v: any) => setRowsPerPage(v)}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Rows/Page" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Rows/Page: Auto</SelectItem>
              <SelectItem value="2">Rows/Page: 2</SelectItem>
              <SelectItem value="3">Rows/Page: 3</SelectItem>
              <SelectItem value="4">Rows/Page: 4</SelectItem>
              <SelectItem value="5">Rows/Page: 5</SelectItem>
              <SelectItem value="6">Rows/Page: 6</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleReconcile} disabled={reconciling} title={`Fix vouchers showing ${currencySymbol} 0`}>
            {reconciling ? <RefreshCcw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wrench className="mr-1.5 h-3.5 w-3.5" />}
            Fix Amounts
          </Button>
          {deleteTargetCount > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" disabled={deletingVouchers}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  {selectedIds.length > 0 ? `Delete (${selectedIds.length})` : `Delete All (${vouchersData?.totalResults || 0})`}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {deleteTargetLabel}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {selectedIds.length > 0
                      ? 'This will permanently delete the selected vouchers, linked payment records, and credit wallet balances for students with no remaining vouchers.'
                      : `This will permanently delete all vouchers matching your current filters${activeFilterParts.length ? ` (${activeFilterParts.join(' · ')})` : ''}, including paid vouchers, payment records, and credit wallet balances for affected students.`}
                    {' '}This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleBulkDelete}
                    disabled={deletingVouchers}
                  >
                    {deletingVouchers ? 'Deleting…' : 'Delete'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {(receivable?.totalCreditBalance || 0) > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-amber-700 hover:text-amber-800" disabled={clearingWallets}>
                  <Wallet className="mr-1.5 h-3.5 w-3.5" />
                  Clear Wallets ({formatMoney(receivable?.totalCreditBalance || 0)})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear credit wallets?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will reset {formatMoney(receivable?.totalCreditBalance || 0)} held in student credit wallets
                    for students who have no fee vouchers left
                    {filters.classId !== 'all' ? ` in the selected class` : ''}.
                    Advance payment records will also be removed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearWallets} disabled={clearingWallets}>
                    {clearingWallets ? 'Clearing…' : 'Clear Wallets'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
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
            {formatMoney(receivable?.thisMonthReceivable || 0)}
          </p>
          <p className="text-[10px] text-muted-foreground">{receivable?.thisMonthVouchers || 0} voucher(s) pending</p>
        </div>
        {/* Previous arrears */}
        <div className="rounded-lg border bg-card px-3 py-2.5">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Previous Arrears</p>
          <p className={`text-base font-bold ${(receivable?.previousArrears || 0) > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
            {formatMoney(receivable?.previousArrears || 0)}
          </p>
          <p className="text-[10px] text-muted-foreground">{receivable?.arrearsVouchers || 0} older month(s)</p>
        </div>
        {/* Total receivable */}
        <div className="rounded-lg border bg-amber-50 border-amber-200 px-3 py-2.5">
          <p className="text-[10px] font-medium text-amber-700 uppercase tracking-wide mb-1">Total Receivable</p>
          <p className="text-base font-bold text-amber-700">
            {formatMoney(receivable?.totalReceivable || 0)}
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
            {formatMoney(receivable?.totalReceivedThisMonth || 0)}
          </p>
          <p className="text-[10px] text-blue-600">{receivable?.paidVouchersThisMonth || 0} voucher(s) paid</p>
        </div>
        {/* Advance / credit wallet */}
        <div className="rounded-lg border bg-emerald-50 border-emerald-200 px-3 py-2.5">
          <p className="text-[10px] font-medium text-emerald-700 uppercase tracking-wide mb-1 flex items-center gap-1">
            <Wallet className="h-3 w-3" /> Advance Received
          </p>
          <p className="text-base font-bold text-emerald-700">
            {formatMoney(receivable?.totalCreditBalance || 0)}
          </p>
          <p className="text-[10px] text-emerald-600">held in credit wallet(s)</p>
          <p className="text-[10px] text-blue-600">{formatMoney(receivable?.totalWalletAppliedThisMonth || 0)} used from wallet this month</p>
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
          />
          {isFetching && (
            <RefreshCcw className="absolute right-8 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
          )}
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
        <Select value={filters.voucherType} onValueChange={(v) => setFilters({ ...filters, voucherType: v, page: 1 })}>
          <SelectTrigger className="w-28 h-9"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="exam">Exam Fee</SelectItem>
            <SelectItem value="admission">Admission</SelectItem>
            <SelectItem value="misc">Misc</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Voucher Table */}
      {isFetching && !isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
          Updating results...
        </div>
      )}
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
            {voucherGroups.map((group: any[]) => {
              const v = group[0];
              const isMulti = group.length > 1;
              const groupIds = group.map((g) => g.id);
              const groupKey = groupIds.join('_');
              const isExpanded = expandedGroups.includes(groupKey);
              const cfg = STATUS_CONFIG[worstStatus(group)] || STATUS_CONFIG.unpaid;
              const net = group.reduce((s, g) => s + vNet(g), 0);
              const paid = group.reduce((s, g) => s + (g.paidAmount || 0), 0);
              const pct = net > 0 ? Math.round((paid / net) * 100) : 0;
              const earliestDueDate = group.reduce((earliest: string | null, g) =>
                !earliest || (g.dueDate && g.dueDate < earliest) ? g.dueDate : earliest, null as string | null
              );
              const isSelected = groupIds.every((id) => selectedIds.includes(id));
              const bal = getStudentBalance(v);
              return (
                <div key={groupKey}>
                  <div
                    className={`grid grid-cols-[2rem_1fr_auto_auto_auto] gap-3 items-center px-4 py-3 hover:bg-muted/20 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
                  >
                    <Checkbox checked={isSelected} onCheckedChange={() => toggleSelectGroup(groupIds)} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isMulti && (
                          <button
                            type="button"
                            className="p-0.5 rounded hover:bg-muted shrink-0"
                            onClick={() => toggleGroupExpand(groupKey)}
                            title={isExpanded ? 'Hide fund breakdown' : 'Show fund breakdown'}
                          >
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        <span className="font-medium text-sm">
                          {v.studentId?.firstName} {v.studentId?.lastName}
                          {(v.studentId?.parent?.fatherName || v.studentId?.parent?.guardianName)
                            ? ` (S/O ${v.studentId?.parent?.fatherName || v.studentId?.parent?.guardianName})`
                            : ''}
                        </span>
                        {v.studentId?.admissionNumber && (
                          <span className="text-xs text-muted-foreground">#{v.studentId.admissionNumber}</span>
                        )}
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{v.classId?.name}</Badge>
                        {v.voucherType === 'exam' && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-violet-50 text-violet-700 border-violet-200">
                            Exam Fee
                          </Badge>
                        )}
                        {isMulti && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{group.length} funds</Badge>
                        )}
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
                          {isMulti
                            ? `${group.length} vouchers · ${v.month} ${v.year}`
                            : (v.voucherNumber || '—') + (v.voucherType === 'exam' && v.feeItems?.[0]?.name
                              ? ` · ${v.feeItems[0].name}`
                              : ` · ${v.month} ${v.year}`)}
                          {' · Due '}
                          {earliestDueDate ? new Date(earliestDueDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </span>
                        {v.studentId?.parent?.phone && (
                          <span className="text-[11px] text-muted-foreground">
                            Guardian: {v.studentId.parent.phone}
                          </span>
                        )}
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
                      <p className="text-sm font-semibold">{formatMoney(net)}</p>
                      {paid > 0 && worstStatus(group) !== 'paid' && (
                        <p className="text-[10px] text-amber-600">Due: {(net - paid).toLocaleString()}</p>
                      )}
                      {!isMulti && (v.discount || 0) > 0 && (
                        <p className="text-[10px] text-muted-foreground">Disc: {v.discount?.toLocaleString()}</p>
                      )}
                    </div>
                    {/* Total Due: all months, with arrears breakdown */}
                    <div className="text-right min-w-[90px]">
                      {bal.totalOutstanding > 0 ? (
                        <>
                          <p className="text-sm font-bold text-red-600">{formatMoney(bal.totalOutstanding)}</p>
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
                      {worstStatus(group) !== 'cancelled' && bal.totalOutstanding > 0 && (
                        <Button size="sm" className="h-7 text-xs px-2.5" onClick={() => openPay(v)}>
                          <DollarSign className="h-3 w-3 mr-1" /> Collect
                        </Button>
                      )}
                      <Button
                        size="icon" variant="outline" className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                        title="Record advance payment to credit wallet"
                        onClick={() => openAdvance(v)}
                      >
                        <ArrowUpCircle className="h-3.5 w-3.5" />
                      </Button>
                      {group.some((g: any) => g.status !== 'paid') && (
                        <Button
                          size="icon" variant="outline" className="h-7 w-7 text-amber-600 hover:text-amber-700 hover:bg-amber-50 border-amber-200"
                          title="Print fee voucher(s) — unpaid/partial"
                          onClick={() => handlePrint(undefined, groupIds, 'pending')}
                        >
                          <Printer className="h-3 w-3" />
                        </Button>
                      )}
                      {group.some((g: any) => g.status === 'paid') && (
                        <Button
                          size="icon" variant="outline" className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                          title="Print paid voucher(s) — receipt"
                          onClick={() => handlePrint(undefined, groupIds, 'paid')}
                        >
                          <Printer className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Per-fund breakdown — only when expanded */}
                  {isMulti && isExpanded && (
                    <div className="bg-muted/20 border-t divide-y">
                      {group.map((g: any) => {
                        const gCfg = STATUS_CONFIG[g.status] || STATUS_CONFIG.unpaid;
                        const gNet = vNet(g);
                        return (
                          <div key={g.id} className="grid grid-cols-[2rem_1fr_auto_auto_auto] gap-3 items-center pl-11 pr-4 py-2">
                            <span />
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-medium truncate">{voucherFundLabel(g.feeItems) || 'Fee'}</span>
                              <span className={`inline-flex items-center rounded-full px-1.5 py-0 text-[9px] font-medium border ${gCfg.bg} ${gCfg.text}`}>{gCfg.label}</span>
                              <span className="text-[10px] text-muted-foreground">{g.voucherNumber || '—'}</span>
                            </div>
                            <span className="text-xs font-semibold text-right">{formatMoney(gNet)}</span>
                            <span />
                            <div className="flex gap-1.5 justify-end">
                              {g.status !== 'cancelled' && g.status !== 'paid' && (
                                <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={() => openPay(g)}>
                                  Collect
                                </Button>
                              )}
                              <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => handlePrint(undefined, g.id)}>
                                <Printer className="h-2.5 w-2.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Bulk Generate Vouchers
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Classes — one, several, or all */}
            <div className="space-y-1.5">
              <Label>Classes <span className="text-destructive">*</span></Label>
              <div className="rounded-lg border shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b bg-muted/40">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={classes.length > 0 && genClassCount === classes.length}
                      onCheckedChange={(checked) => selectAllGenClasses(!!checked)}
                    />
                    <span className="text-sm font-semibold">Select All Classes</span>
                  </label>
                  <span className="text-xs font-medium text-muted-foreground">{genClassCount} of {classes.length} selected</span>
                </div>
                <ScrollArea className="h-40">
                  <div className="grid grid-cols-2 gap-1.5 p-2.5">
                    {classes.map((c: any) => {
                      const isSelected = genForm.classIds.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className={`flex items-center gap-2 rounded-md border px-2.5 py-2 cursor-pointer transition-colors ${isSelected ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:bg-muted/50'}`}
                        >
                          <Checkbox checked={isSelected} onCheckedChange={(checked) => toggleGenClassSelection(c.id, !!checked)} />
                          <span className="text-sm truncate">{c.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
              {genClassCount > 1 && (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-1.5">
                  Vouchers will be generated across all {genClassCount} selected classes in one go. Students who already have a voucher covering this period are skipped automatically.
                </p>
              )}
            </div>

            {/* Fee source */}
            <div className="space-y-1.5">
              <Label>Fee Source <span className="text-destructive">*</span></Label>
              <Select
                value={genForm.feeSource}
                onValueChange={(v: any) => setGenForm({ ...genForm, feeSource: v, feeStructureId: '', fundName: '' })}
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
                      <span className="text-xs text-muted-foreground">Apply a class-level fee structure to all students</span>
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
                  Students with individual fees will use those; the rest will get the selected voucher category below.
                </p>
              )}
            </div>

            {/* Multiple classes + fee structure: pick a fund by name, applied per class */}
            {genForm.feeSource !== 'admission_form' && genClassCount > 1 && (
              <div className="space-y-1.5">
                <Label>Voucher Category <span className="text-destructive">*</span></Label>
                <Select value={genForm.fundName} onValueChange={(v) => setGenForm({ ...genForm, fundName: v })}>
                  <SelectTrigger><SelectValue placeholder={fundNameOptions.length ? 'Select a fund' : 'No shared funds found'} /></SelectTrigger>
                  <SelectContent>
                    {fundNameOptions.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5">
                  Each selected class's own "{genForm.fundName || '…'}" structure is applied automatically — a monthly fund generates every month, quarterly once a quarter, annual/one-time only once. Classes without a matching structure are skipped.
                </p>
              </div>
            )}

            {/* Single class + fee structure: pick a specific structure document */}
            {genForm.feeSource !== 'admission_form' && genClassCount === 1 && (
              <div className="space-y-1.5">
                <Label>Fee Structure <span className="text-destructive">*</span></Label>
                <Select
                  value={genForm.feeStructureId}
                  onValueChange={(v) => setGenForm({ ...genForm, feeStructureId: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select structure" /></SelectTrigger>
                  <SelectContent>
                    {structures.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} — {formatMoney(s.totalAmount || 0)}
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
              disabled={generating || !genClassCount || genStructureMissing}
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
                            <p className="text-[10px] text-emerald-600">Will be auto-applied to the month(s) you select below</p>
                          </div>
                        </div>
                        <p className="text-base font-bold text-emerald-700">{formatMoney(studentSummary.creditBalance)}</p>
                      </div>
                    )}
                    {/* Summary stats row */}
                    <div className="grid grid-cols-3 divide-x">
                      <div className="px-3 py-2.5 text-center">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Total Outstanding</p>
                        <p className={`text-sm font-bold ${studentSummary.totalPending > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {formatMoney(studentSummary.totalPending || 0)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{studentSummary.pendingCount} month(s)</p>
                      </div>
                      <div className="px-3 py-2.5 text-center">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Total Received</p>
                        <p className="text-sm font-bold text-emerald-600">
                          {formatMoney(studentSummary.totalReceived || 0)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{studentSummary.paidCount} paid</p>
                      </div>
                      <div className="px-3 py-2.5 text-center">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Total Billed</p>
                        <p className="text-sm font-bold">
                          {formatMoney(studentSummary.totalBilled || 0)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{studentSummary.totalVouchers} voucher(s)</p>
                      </div>
                    </div>

                    {/* Pending months are now shown as an interactive checklist below (Select Month(s) to Collect) */}

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
                        <span className="text-sm font-bold text-emerald-700">{formatMoney(studentSummary.lastPaid.paidAmount || 0)}</span>
                      </div>
                    )}
                    <div className="px-3 py-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setLedgerDialog(true)}
                      >
                        <History className="h-3 w-3 mr-1" /> View Complete Fee Ledger
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* ── Select month(s) to collect ── */}
              <div className="rounded-lg border overflow-hidden">
                <div className="bg-muted/60 px-3 py-2 flex items-center justify-between gap-2 border-b flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Select Month(s) to Collect</span>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      className="text-[10px] font-medium px-2 py-1 rounded-full border hover:bg-muted transition-colors"
                      onClick={selectThisMonthOnly}
                    >
                      This Month Only
                    </button>
                    <button
                      type="button"
                      className="text-[10px] font-medium px-2 py-1 rounded-full border border-red-200 text-red-600 hover:bg-red-50 transition-colors flex items-center gap-1"
                      onClick={selectAllArrearsMonths}
                    >
                      <ChevronsUp className="h-2.5 w-2.5" /> All Arrears
                    </button>
                  </div>
                </div>
                <div className="divide-y max-h-48 overflow-y-auto">
                  {monthOptions.map((m) => {
                    const cfg = STATUS_CONFIG[m.status] || STATUS_CONFIG.unpaid;
                    const checked = selectedMonthIds.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        className={`flex items-center justify-between gap-2 px-3 py-2 cursor-pointer transition-colors ${checked ? 'bg-emerald-50/70' : 'hover:bg-muted/40'}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Checkbox checked={checked} onCheckedChange={() => toggleMonthSelect(m.id)} />
                          <span className="text-sm font-medium truncate">
                            {m.month} {m.year}
                            {m.label && <span className="text-muted-foreground font-normal"> · {m.label}</span>}
                          </span>
                          <span className={`inline-flex items-center rounded-full px-1.5 py-0 text-[9px] font-medium border shrink-0 ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                        </div>
                        <span className="text-sm font-semibold text-red-600">{formatMoney(m.remaining)}</span>
                      </label>
                    );
                  })}
                  {monthOptions.length === 0 && (
                    <p className="px-3 py-3 text-xs text-muted-foreground text-center">No pending months found</p>
                  )}
                </div>
                <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-t">
                  <span className="text-xs text-muted-foreground">
                    {selectedMonthIds.length} of {monthOptions.length} month{monthOptions.length !== 1 ? 's' : ''} selected
                  </span>
                  <span className="text-sm font-bold">{formatMoney(selectedMonthsTotal)}</span>
                </div>
              </div>

              {/* ── Itemized fee breakdown — only when the single clicked voucher is the sole selection ── */}
              {selectedMonthIds.length === 1 &&
                selectedMonthIds[0] === (selectedVoucher.id || selectedVoucher._id) &&
                selectedVoucher.feeItems?.length > 0 && (
                <div className="rounded-lg border bg-muted/30 px-3 py-2.5 space-y-0.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    {selectedVoucher.voucherNumber || 'No voucher #'} · Fee Breakdown
                  </p>
                  {selectedVoucher.feeItems.map((fi: any, i: number) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{fi.name}</span>
                      <span>{formatMoney(fi.amount || 0)}</span>
                    </div>
                  ))}
                  {(selectedVoucher.discount || 0) > 0 && (
                    <div className="flex justify-between text-xs text-emerald-600">
                      <span>Discount</span>
                      <span>− {formatMoney(selectedVoucher.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs font-semibold border-t pt-1 mt-1">
                    <span>Net Due</span>
                    <span>{formatMoney(svNet)}</span>
                  </div>
                  {(selectedVoucher.paidAmount || 0) > 0 && (
                    <div className="flex justify-between text-xs font-semibold text-amber-600">
                      <span>Remaining</span>
                      <span>{formatMoney(remaining)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Amount input ── */}
              <div className="space-y-1.5">
                <Label>Amount Paying ({currencySymbol}) <span className="text-destructive">*</span></Label>
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
                    Full — {formatMoney(quickPayFull)}
                  </button>
                  {selectedMonthsTotal > 0 && (
                    <button
                      className="text-xs px-2 py-1 rounded border hover:bg-muted transition-colors"
                      onClick={() => setPayForm({ ...payForm, amount: String(Math.floor(selectedMonthsTotal / 2)) })}
                    >
                      Half — {formatMoney(Math.floor(selectedMonthsTotal / 2))}
                    </button>
                  )}
                  {/* Use credit wallet shortcut */}
                  {studentSummary && studentSummary.creditBalance > 0 && selectedMonthsTotal > 0 && (
                    <button
                      className="text-xs px-2 py-1 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors flex items-center gap-1"
                      onClick={() => setPayForm({ ...payForm, amount: '0' })}
                      title="Credit will auto-apply when paying — no extra cash needed if credit covers it"
                    >
                      <Wallet className="h-3 w-3" />
                      Credit: +{studentSummary.creditBalance.toLocaleString()}
                    </button>
                  )}
                </div>
                {payForm.amount && Number(payForm.amount) > 0 && quickPayFull > 0 && (
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
              disabled={bulkPaying || !payForm.amount || Number(payForm.amount) <= 0 || !selectedMonthIds.length}
            >
              {bulkPaying
                ? <><RefreshCcw className="mr-2 h-3.5 w-3.5 animate-spin" />Processing…</>
                : <><CheckCircle2 className="mr-2 h-3.5 w-3.5" />Confirm {formatMoney(Number(payForm.amount || 0))}</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Student Fee Ledger Dialog ─────────────────────────────── */}
      <Dialog open={ledgerDialog} onOpenChange={setLedgerDialog}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" /> Student Fee Ledger
            </DialogTitle>
          </DialogHeader>
          {loadingLedger ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <RefreshCcw className="h-4 w-4 animate-spin" /> Loading ledger...
            </div>
          ) : studentLedger ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded border p-2">
                  <p className="text-[10px] text-muted-foreground">Student</p>
                  <p className="text-sm font-semibold">{studentLedger.student?.name || '—'}</p>
                </div>
                <div className="rounded border p-2">
                  <p className="text-[10px] text-muted-foreground">Total Billed</p>
                  <p className="text-sm font-semibold">{formatMoney(studentLedger.summary?.totalBilled || 0)}</p>
                </div>
                <div className="rounded border p-2">
                  <p className="text-[10px] text-muted-foreground">Total Paid/Credit</p>
                  <p className="text-sm font-semibold text-emerald-700">{formatMoney(studentLedger.summary?.totalPaid || 0)}</p>
                </div>
                <div className="rounded border p-2">
                  <p className="text-[10px] text-muted-foreground">Outstanding</p>
                  <p className="text-sm font-semibold text-red-600">{formatMoney(studentLedger.summary?.outstanding || 0)}</p>
                </div>
              </div>

              <div className="rounded border overflow-x-auto">
                <div className="grid grid-cols-[7rem_6rem_6rem_1fr_6rem_6rem_6rem_2rem] gap-2 px-3 py-2 bg-muted/50 text-[11px] font-medium text-muted-foreground border-b min-w-[50rem]">
                  <span>Date</span>
                  <span>Due Date</span>
                  <span>Paid Date</span>
                  <span>Particular</span>
                  <span className="text-right">Debit</span>
                  <span className="text-right">Credit</span>
                  <span className="text-right">Balance</span>
                  <span></span>
                </div>
                <div className="max-h-[50vh] overflow-y-auto divide-y min-w-[50rem]">
                  {(studentLedger.entries || []).map((e: any, idx: number) => (
                    <div key={idx} className="grid grid-cols-[7rem_6rem_6rem_1fr_6rem_6rem_6rem_2rem] gap-2 px-3 py-2 text-xs items-start">
                      <span className="text-muted-foreground">
                        {e.date ? new Date(e.date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </span>
                      <span className="text-muted-foreground">
                        {e.dueDate ? new Date(e.dueDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </span>
                      <span className="text-muted-foreground">
                        {e.paidDate ? new Date(e.paidDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </span>
                      <div>
                        <p className="font-medium">{e.label}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {e.voucherNumber ? `${e.voucherNumber}` : '—'}
                          {e.paymentMethod ? ` · ${e.paymentMethod}` : ''}
                        </p>
                      </div>
                      <span className="text-right text-red-600">{(e.debit || 0) > 0 ? (e.debit || 0).toLocaleString() : '—'}</span>
                      <span className="text-right text-emerald-700">{(e.credit || 0) > 0 ? (e.credit || 0).toLocaleString() : '—'}</span>
                      <span className="text-right font-semibold">{(e.runningBalance || 0).toLocaleString()}</span>
                      <span className="flex justify-end">
                        {e.type === 'voucher_payment' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            title="Print Payment Receipt"
                            onClick={() => openReceiptPrintWindow({
                              receiptNumber: `RCP-${e.voucherNumber || 'ADV'}-${new Date(e.paidDate || e.date).getTime()}`,
                              paidDate: e.paidDate || e.date,
                              studentName: studentLedger.student?.name || '—',
                              fatherName: studentLedger.student?.fatherName || '—',
                              admissionNumber: studentLedger.student?.admissionNumber || '—',
                              rollNumber: studentLedger.student?.rollNumber || '—',
                              studentUserId: studentLedger.student?.studentUserId || '—',
                              className: studentLedger.student?.className || '—',
                              paymentMethod: e.paymentMethod || '—',
                              remarks: e.meta?.description || e.meta?.remarks || '',
                              items: [{ label: e.label, amount: e.credit || 0 }],
                              totalAmount: e.credit || 0,
                            })}
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-6">No ledger data available.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLedgerDialog(false)}>Close</Button>
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
              <Label>Advance Amount ({currencySymbol}) <span className="text-destructive">*</span></Label>
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
                : <><ArrowUpCircle className="mr-2 h-3.5 w-3.5" />Add {formatMoney(Number(advanceForm.amount || 0))} to Wallet</>
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
                        ? <span className="text-blue-700 font-medium">{formatMoney(prorated)} (prorated)</span>
                        : <span>{formatMoney(mf)} (full)</span>}
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
                    <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-medium">{formatMoney(subtotal)}</span></div>
                    {disc > 0 && <div className="flex justify-between text-emerald-600"><span>Discount</span><span>- {formatMoney(disc)}</span></div>}
                    <div className="flex justify-between font-semibold border-t pt-1 mt-1"><span>Net Amount</span><span>{formatMoney(net)}</span></div>
                  </div>
                );
              })()}
            </div>

            {/* Discount & Remarks */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Discount ({currencySymbol})</Label>
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

// ── Shared voucher-card CSS (used by the Fee Challan print and the Payment Receipt print) ──
function voucherPrintCSS(selectedSize: { baseFont: number; schoolFont: number; rowGap: number; scale: number }): string {
  return `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: #fff; color: #000; font-size: ${selectedSize.baseFont}px; }

  /* ── A4 Page ─────────────────────────── */
  .sheet {
    width: 210mm;
    padding: 5mm 6mm;
  }
  .sheet.forced-page { page-break-after: always; }
  .sheet.forced-page:last-child { page-break-after: auto; }

  /* ── Student row (one student = 2 copies) */
  .row {
    display: flex;
    align-items: stretch;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .row.has-cut {
    border-bottom: 1.5px dashed #666;
    padding-bottom: ${selectedSize.rowGap}mm;
    margin-bottom: ${selectedSize.rowGap}mm;
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
    font-size: ${selectedSize.baseFont}px;
    line-height: 1.2;
  }

  /* ── Header ───────────────────────────── */
  .vc-head {
    text-align: center;
    border-bottom: 1px solid #000;
    padding: 3px 4px 2px;
  }
  .vc-school {
    font-size: ${selectedSize.schoolFont}px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    line-height: 1.2;
  }
  .vc-title {
    font-size: calc(9px * ${selectedSize.scale});
    font-weight: 700;
    border-top: 1px solid #000;
    border-bottom: 1px solid #000;
    padding: 2px 0;
    margin: 2px 0 1px;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .vc-sub { font-size: calc(8px * ${selectedSize.scale}); }

  /* ── Info rows ────────────────────────── */
  .vc-info { width: 100%; border-collapse: collapse; }
  .vc-info td {
    padding: 2.5px 5px;
    border-bottom: 1px solid #ddd;
    vertical-align: middle;
    font-size: calc(9px * ${selectedSize.scale});
  }
  .vc-info .lbl { color: #000; font-size: calc(8px * ${selectedSize.scale}); white-space: nowrap; padding-right: 2px; width: 34px; }
  .vc-info .val {
    border-bottom: 1px dotted #555;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 0;
  }
  .vc-info .sep { width: 4px; }

  /* ── Fee items table ──────────────────── */
  .vc-fee { width: 100%; border-collapse: collapse; }
  .vc-fee thead tr { background: #efefef; }
  .vc-fee th {
    padding: 3px 5px;
    font-size: calc(8px * ${selectedSize.scale});
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border: 1px solid #bbb;
    text-align: left;
  }
  .vc-fee th.r, .vc-fee td.r { text-align: right; }
  .vc-fee td {
    padding: 2.5px 4px;
    font-size: calc(8.3px * ${selectedSize.scale});
    border: 1px solid #ddd;
    white-space: nowrap;
  }
  .vc-fee td.sno { text-align: center; width: 14px; color: #555; font-size: calc(7.5px * ${selectedSize.scale}); }
  .vc-fee td.r { font-weight: 600; }
  .vc-fee td:nth-child(2) { white-space: normal; }

  /* ── Totals ───────────────────────────── */
  .vc-total { width: 100%; border-collapse: collapse; border-top: 2px solid #000; }
  .vc-total td { padding: 5px; font-size: calc(10px * ${selectedSize.scale}); }
  .vc-total td.tlbl { width: 60%; font-weight: 700; }
  .vc-total td.tamt { text-align: right; font-weight: 800; font-size: calc(13px * ${selectedSize.scale}); }
  /* Paid / Remaining breakdown rows (only rendered when something has been paid) */
  .vc-total tr.paid-row td { font-weight: 600; }
  .vc-total tr.paid-row td.paid-amt { font-weight: 800; }
  .vc-total tr.due-row td, .vc-total tr.cleared-row td { border-top: 1px dashed #999; }
  /* The one figure on the whole challan that matters most — still-owed amount —
     gets a bold boxed callout so it can't be missed at a glance. */
  .vc-total tr.due-row td.due-amt {
    font-weight: 900;
    font-size: calc(16px * ${selectedSize.scale});
    border: 2px solid #000;
    padding: 3px 10px;
  }

  /* ── PAID stamp (B&W) ─────────────────── */
  .paid-stamp {
    text-align: center;
    font-size: calc(9.5px * ${selectedSize.scale});
    font-weight: 900;
    letter-spacing: 3px;
    border: 2px solid #000;
    padding: 1px 6px;
    display: inline-block;
    margin: 2px auto;
  }

  /* ── Signature row — real blank room for a pen signature or rubber stamp,
     not just an inline underscore, so it prints usably at any size ── */
  .vc-sigs {
    display: flex;
    justify-content: space-between;
    padding: 3px 5px 2px;
    border-top: 1px solid #aaa;
    margin-top: auto;
    gap: 8px;
  }
  .vc-sig-box {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    text-align: center;
  }
  .vc-sig-space {
    height: calc(20px * ${selectedSize.scale});
    border-bottom: 1px solid #000;
  }
  .vc-sig-label {
    font-size: calc(7.8px * ${selectedSize.scale});
    padding-top: 1.5px;
    white-space: nowrap;
  }

  /* ── Copy label ───────────────────────── */
  .vc-copy-label {
    text-align: center;
    font-weight: 800;
    font-size: calc(8.5px * ${selectedSize.scale});
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

  /* ── "Payment Received" banner — states exactly which month(s) this receipt covers ── */
  .vc-paid-banner {
    text-align: center;
    padding: 2px 4px 1.5px;
    border-bottom: 1px dashed #000;
    background: #f3f3f3;
  }
  .vc-paid-banner-title {
    font-size: calc(9px * ${selectedSize.scale});
    font-weight: 900;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .vc-paid-banner-detail {
    display: block;
    font-size: calc(8px * ${selectedSize.scale});
    font-weight: 600;
  }

  /* ── Still-outstanding arrear rows shown for context (not part of this payment) ── */
  .pending-row td { font-style: italic; color: #444; }
  .pending-tag {
    font-style: normal;
    font-size: calc(6.5px * ${selectedSize.scale});
    font-weight: 700;
    letter-spacing: 0.4px;
    border: 1px solid #888;
    border-radius: 3px;
    padding: 0 3px;
    margin-left: 3px;
    white-space: nowrap;
  }

  /* ── Rows that are settled/received — the visual opposite of a pending row ── */
  .received-row td { font-weight: 600; }
  .received-tag {
    font-style: normal;
    font-size: calc(6.5px * ${selectedSize.scale});
    font-weight: 800;
    letter-spacing: 0.4px;
    border: 1.5px solid #000;
    border-radius: 3px;
    padding: 0 3px;
    margin-left: 3px;
    white-space: nowrap;
  }
  .vc-arrears-note {
    text-align: center;
    font-size: calc(7px * ${selectedSize.scale});
    font-style: italic;
    color: #444;
    padding: 2px 4px;
    border-top: 1px dashed #aaa;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { size: A4 portrait; margin: 0; }
  }`;
}

// ── Professional Print HTML (auto-pack max vouchers per page) ─────────────────────
function buildPrintHTML(
  vouchers: any[],
  schoolName: string,
  invoiceNote?: string,
  settings?: { layout?: 'auto' | 'large' | 'medium' | 'compact'; rowsPerPage?: 'auto' | '2' | '3' | '4' | '5' | '6' },
  currencySymbol: string = FALLBACK_CURRENCY.symbol
): string {
  const autoLayout = vouchers.length <= 2 ? 'large' : vouchers.length <= 4 ? 'medium' : 'compact';
  const layout = settings?.layout && settings.layout !== 'auto' ? settings.layout : autoLayout;
  const rowsPerPage = settings?.rowsPerPage && settings.rowsPerPage !== 'auto' ? Number(settings.rowsPerPage) : 0;
  const sizeMap = {
    large: { baseFont: 10, schoolFont: 14, rowGap: 3.8, scale: 1.08 },
    medium: { baseFont: 9, schoolFont: 13, rowGap: 2.8, scale: 1.03 },
    compact: { baseFont: 8.5, schoolFont: 12, rowGap: 1.8, scale: 0.98 },
  } as const;
  const selectedSize = sizeMap[layout];

  const rowHtml = (v: any, ri: number, total: number) => `
    <div class="row${ri < total - 1 ? ' has-cut' : ''}">
      <div class="half">${voucherCopyHTML(v, schoolName, 'Student Copy', invoiceNote, currencySymbol)}</div>
      <div class="vcut"><span>✂</span></div>
      <div class="half">${voucherCopyHTML(v, schoolName, 'Office Copy', invoiceNote, currencySymbol)}</div>
    </div>
  `;

  let pageHTML = '';
  if (rowsPerPage > 0) {
    for (let i = 0; i < vouchers.length; i += rowsPerPage) {
      const chunk = vouchers.slice(i, i + rowsPerPage);
      pageHTML += `<div class="sheet forced-page">${chunk.map((v, idx) => rowHtml(v, idx, chunk.length)).join('')}</div>`;
    }
  } else {
    const rows = vouchers.map((v, ri) => rowHtml(v, ri, vouchers.length)).join('');
    pageHTML = `<div class="sheet">${rows}</div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Fee Vouchers — ${schoolName}</title>
<style>${voucherPrintCSS(selectedSize)}</style>
</head>
<body>
${pageHTML}
</body>
</html>`;
}

function voucherCopyHTML(v: any, schoolName: string, copyLabel: string, invoiceNote?: string, currencySymbol: string = FALLBACK_CURRENCY.symbol): string {
  const feeItems: any[] = v.feeItems || [];
  const discount = v.discount || 0;
  const fine = v.fine || 0;

  const dueDate = v.dueDate
    ? new Date(v.dueDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
  const paidDate = v.paidDate
    ? new Date(v.paidDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
  const session = `${v.year || ''}–${(v.year || 0) + 1}`;
  const guardianPhone = v.studentId?.parent?.phone || '—';
  const fatherName = v.studentId?.parent?.fatherName || v.studentId?.parent?.guardianName || '—';
  const otherPendingMonths: any[] = v.pendingDetails?.months || [];
  const otherPaidMonths: any[] = v.paidHistoryDetails?.months || [];

  // Own fund(s) — each tagged PAID/PARTIAL/PENDING by ITS OWN document's status, so a
  // merged multi-fund challan (see mergeVoucherGroupForPrint) never borrows one fund's
  // status for another. A single un-merged voucher just resolves its own row here.
  const ownRows = v.ownFundRows?.length ? v.ownFundRows : buildOwnFundRows({ feeItems, status: v.status, paidAmount: v.paidAmount, paidDate: v.paidDate, paidThisTransaction: v.paidThisTransaction, month: v.month, year: v.year });

  // Arrears from OTHER months (already de-duplicated server-side against every voucher
  // in this same print batch, so a fund's sibling being printed right here never
  // reappears as a separate "pending"/"paid history" row).
  const otherPaidRows = otherPaidMonths.map((p: any) => ({
    name: p.feeItems?.length === 1 && p.feeItems[0]?.name
      ? feeItemLabel(p.feeItems[0].name, p.month, p.year)
      : p.voucherType === 'exam'
        ? feeItemLabel('Exam Fee', p.month, p.year)
        : feeItemLabel('Paid Fee', p.month, p.year),
    amount: Number(p.amount || 0),
    tagText: 'PAID', tagClass: 'received-tag', rowClass: ' class="received-row"',
    paidAmt: Number(p.amount || 0),
    dateLabel: formatDayMonth(p.paidDate),
    isPaidHistory: true,
  }));
  const otherPendingRows = otherPendingMonths.map((p: any) => ({
    name: p.feeItems?.length === 1 && p.feeItems[0]?.name
      ? feeItemLabel(p.feeItems[0].name, p.month, p.year)
      : p.voucherType === 'exam'
        ? feeItemLabel('Exam Fee', p.month, p.year)
        : feeItemLabel('Pending Fee', p.month, p.year),
    amount: Number(p.remaining || 0),
    tagText: 'PENDING', tagClass: 'pending-tag', rowClass: ' class="pending-row"',
    paidAmt: 0,
    isPending: true,
  }));

  const enrichedRows = [...ownRows, ...otherPaidRows, ...otherPendingRows];

  // Fully settled rows always print above anything still owed (partially or fully
  // pending) — a stable sort keeps each group's original chronological order intact.
  const orderedRows = [...enrichedRows].sort((a, b) => {
    const aOwes = (a.amount || 0) - (a.paidAmt || 0) > 0 ? 1 : 0;
    const bOwes = (b.amount || 0) - (b.paidAmt || 0) > 0 ? 1 : 0;
    return aOwes - bOwes;
  });

  const itemRows = orderedRows
    .map((fi, i) => {
      const label = fi.tagText
        ? `${fi.name} <span class="${fi.tagClass}">${fi.tagText}${fi.dateLabel ? ` ${fi.dateLabel}` : ''}</span>`
        : fi.name;
      return `<tr${fi.rowClass}>
          <td class="sno">${i + 1}</td>
          <td>${label}</td>
          <td class="r">${(fi.amount || 0).toLocaleString()}/-</td>
          <td class="r">${fi.paidAmt > 0 ? fi.paidAmt.toLocaleString() + '/-' : '0/-'}</td>
        </tr>`;
    })
    .join('');

  // How much of the displayed total is arrears from OTHER months, not covered by this payment
  const otherArrearsTotal = otherPendingRows.reduce((s: number, fi: any) => s + (fi.amount || 0), 0);

  const discountRow =
    discount > 0
      ? `<tr><td class="sno"></td><td>Scholarship / Discount</td><td class="r">(${discount.toLocaleString()}/-)</td><td class="r">—</td></tr>`
      : '';
  const fineRow =
    fine > 0
      ? `<tr><td class="sno"></td><td>Late Fine</td><td class="r">${fine.toLocaleString()}/-</td><td class="r">—</td></tr>`
      : '';

  const paidStamp =
    v.status === 'paid'
      ? `<tr><td colspan="4" style="text-align:center;padding:2px 0"><span class="paid-stamp">PAID</span></td></tr>`
      : '';

  const studentName = `${v.studentId?.firstName || ''} ${v.studentId?.lastName || ''}`.trim();
  const studentUserId = v.studentId?.studentUserId || '—';
  const rollNumber = v.studentId?.rollNumber || '—';

  // Bottom line is pending payments only — every row's still-owed portion (amount
  // minus whatever's already been paid on it), never mixed with what's already
  // settled, so this figure always matches "what should actually be collected now".
  const totalPendingOnly = Math.max(
    0,
    enrichedRows.reduce((s, fi) => s + Math.max(0, (fi.amount || 0) - (fi.paidAmt || 0)), 0) - discount + fine
  );

  // Explicit banner stating which month(s) THIS payment covered — set only right after
  // a fresh collection, so a printed receipt never leaves it ambiguous which month was paid.
  const paidBanner = v.paidThisTransaction
    ? `<div class="vc-paid-banner">
        <span class="vc-paid-banner-title">✓ Payment Received${(v.paidMonthsCount || 1) > 1 ? ` — ${v.paidMonthsCount} Month(s)` : ''}</span>
        <span class="vc-paid-banner-detail">For: ${v.paidMonthsLabel || `${v.month} ${v.year}`} &nbsp;|&nbsp; Amount: ${currencySymbol} ${Number(v.amountPaidNow || 0).toLocaleString()}/-</span>
      </div>`
    : '';

  const arrearsNote = v.paidThisTransaction && otherArrearsTotal > 0
    ? `<div class="vc-arrears-note">Also shows ${currencySymbol} ${otherArrearsTotal.toLocaleString()}/- in other outstanding month(s) — not part of this payment</div>`
    : '';

  // Paid Date only reflects money received against THIS voucher specifically.
  const currentVoucherPaidAmount = Number(v.paidAmount || 0);

  const totalsRows = `<tr class="${totalPendingOnly > 0 ? 'due-row' : 'cleared-row'}">
      <td class="tlbl">Total Pending Amount (${currencySymbol}):</td>
      <td class="tamt${totalPendingOnly > 0 ? ' due-amt' : ''}">${totalPendingOnly.toLocaleString()}/-</td>
    </tr>`;

  return `<div class="vc">
  <div class="vc-head">
    <div class="vc-school">${schoolName}</div>
    <div class="vc-title">${v.isAdvanceProjection ? 'Advance Fee Receipt' : 'Fee Challan Voucher'}</div>
    <div class="vc-sub">${v.isAdvanceProjection ? '<span style="font-weight:600">Paid in advance</span> · ' : ''}Month: <b>${v.month || '—'} ${v.year || ''}</b> &nbsp;&nbsp; Session: <b>${session}</b></div>
  </div>
  ${paidBanner}
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
      <td class="val">${studentName || '—'}</td>
      <td class="sep"></td>
      <td class="lbl">Father Name</td>
      <td class="val">${fatherName !== '—' ? fatherName : '—'}</td>
    </tr>
    <tr>
      <td class="lbl">Adm #</td>
      <td class="val">${v.studentId?.admissionNumber || '—'}</td>
      <td class="sep"></td>
      <td class="lbl">Roll No</td>
      <td class="val">${rollNumber}</td>
    </tr>
    <tr>
      <td class="lbl">Student ID</td>
      <td class="val">${studentUserId}</td>
      <td class="sep"></td>
      <td class="lbl">Class</td>
      <td class="val">${v.classId?.name || '—'}${v.sectionId?.name ? ' / ' + v.sectionId.name : ''}</td>
    </tr>
    <tr>
      <td class="lbl">Guardian #</td>
      <td class="val">${guardianPhone}</td>
      <td class="sep"></td>
      <td class="lbl">Paid Date</td>
      <td class="val">${currentVoucherPaidAmount > 0 ? paidDate : '—'}</td>
    </tr>
  </table>
  <table class="vc-fee">
    <thead>
      <tr>
        <th style="width:14px;text-align:center">#</th>
        <th>Description</th>
        <th class="r" style="width:17%">Amount</th>
        <th class="r" style="width:17%">Paid</th>
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
    ${totalsRows}
  </table>
  ${arrearsNote}
  <div class="vc-sigs">
    <div class="vc-sig-box"><div class="vc-sig-space"></div><span class="vc-sig-label">Issued by</span></div>
    <div class="vc-sig-box"><div class="vc-sig-space"></div><span class="vc-sig-label">Checked by</span></div>
    <div class="vc-sig-box"><div class="vc-sig-space"></div><span class="vc-sig-label">Counter Signed by</span></div>
  </div>
  ${invoiceNote?.trim() ? `<div class="vc-note">${invoiceNoteToSafeHtml(invoiceNote)}</div>` : ''}
  <div class="vc-copy-label">${copyLabel}</div>
</div>`;
}

// ── Payment Received Voucher (receipt) — printed on demand, separate from the Fee Challan ──
function receiptCopyHTML(payment: any, schoolName: string, copyLabel: string, currencySymbol: string = FALLBACK_CURRENCY.symbol): string {
  const paidOn = payment.paidDate
    ? new Date(payment.paidDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
  const items: { label: string; amount: number }[] = payment.items || [];
  const itemRows = items
    .map(
      (it, i) => `<tr>
          <td class="sno">${i + 1}</td>
          <td>${it.label}</td>
          <td class="r">${(it.amount || 0).toLocaleString()}/-</td>
        </tr>`
    )
    .join('');

  return `<div class="vc">
  <div class="vc-head">
    <div class="vc-school">${schoolName}</div>
    <div class="vc-title">Payment Received Voucher</div>
    <div class="vc-sub">Receipt #: <b>${payment.receiptNumber || '—'}</b> &nbsp;&nbsp; Date: <b>${paidOn}</b></div>
  </div>
  <table class="vc-info">
    <tr>
      <td class="lbl">Name</td>
      <td class="val">${payment.studentName || '—'}</td>
      <td class="sep"></td>
      <td class="lbl">Father Name</td>
      <td class="val">${payment.fatherName || '—'}</td>
    </tr>
    <tr>
      <td class="lbl">Adm #</td>
      <td class="val">${payment.admissionNumber || '—'}</td>
      <td class="sep"></td>
      <td class="lbl">Roll No</td>
      <td class="val">${payment.rollNumber || '—'}</td>
    </tr>
    <tr>
      <td class="lbl">Class</td>
      <td class="val">${payment.className || '—'}</td>
      <td class="sep"></td>
      <td class="lbl">Method</td>
      <td class="val">${payment.paymentMethod || '—'}</td>
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
    </tbody>
  </table>
  <table class="vc-total">
    <tr>
      <td class="tlbl">Total Received (${currencySymbol}):</td>
      <td class="tamt">${(payment.totalAmount || 0).toLocaleString()}/-</td>
    </tr>
  </table>
  ${payment.remarks?.trim() ? `<div class="vc-note">Remarks: ${escapeHtml(payment.remarks.trim())}</div>` : ''}
  <div class="vc-sigs">
    <div class="vc-sig-box"><div class="vc-sig-space"></div><span class="vc-sig-label">Received by</span></div>
    <div class="vc-sig-box"><div class="vc-sig-space"></div><span class="vc-sig-label">Signature</span></div>
  </div>
  <div class="vc-copy-label">${copyLabel}</div>
</div>`;
}

function buildReceiptPrintHTML(payment: any, schoolName: string, currencySymbol: string = FALLBACK_CURRENCY.symbol): string {
  const selectedSize = { baseFont: 10, schoolFont: 14, rowGap: 3.8, scale: 1.08 };
  const rowHtml = `
    <div class="row">
      <div class="half">${receiptCopyHTML(payment, schoolName, 'Student Copy', currencySymbol)}</div>
      <div class="vcut"><span>✂</span></div>
      <div class="half">${receiptCopyHTML(payment, schoolName, 'Office Copy', currencySymbol)}</div>
    </div>
  `;
  const pageHTML = `<div class="sheet">${rowHtml}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Payment Receipt — ${schoolName}</title>
<style>${voucherPrintCSS(selectedSize)}</style>
</head>
<body>
${pageHTML}
</body>
</html>`;
}


