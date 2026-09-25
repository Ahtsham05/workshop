import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Printer, Eye, Ban, Receipt as ReceiptIcon, Search, History } from 'lucide-react';
import {
  useGetFeeReceiptsQuery,
  useGetFeeReceiptQuery,
  useCancelFeeReceiptMutation,
  useBackfillFeeReceiptsMutation,
} from '@/stores/school.api';
import { useGetMyOrganizationQuery } from '@/stores/organization.api';
import { toast } from 'sonner';
import { useFormatMoney, useCurrencyMeta } from '@/lib/format-money';
import { formatBusinessDate, formatBusinessDateTimeShort, getBusinessToday } from '@/lib/business-timezone';
import { ExportButtons, Loading, EmptyState } from './fee-reports';
import { buildReceiptPrintHTML, feeItemLabel } from './fee-vouchers';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'online', label: 'Online' },
  { value: 'other', label: 'Other' },
  { value: 'credit_wallet', label: 'Credit Wallet' },
];

function ReceiptStatusBadge({ status }: { status: string }) {
  const cfg =
    status === 'cancelled'
      ? { bg: 'bg-red-100', text: 'text-red-700', label: 'Cancelled' }
      : { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Completed' };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
  );
}

const monthsLabel = (allocations: any[]) =>
  (allocations || []).map((a) => `${a.month} ${a.year}`).join(', ') || '—';

/** Maps a populated FeePayment doc into the `payment` shape buildReceiptPrintHTML expects. */
function toPrintablePayment(fp: any): any {
  const student = fp.studentId || {};
  const items = (fp.allocations || []).map((a: any) => {
    const voucher = a.voucherId;
    const label =
      voucher?.feeItems?.length === 1
        ? feeItemLabel(voucher.feeItems[0].name, a.month, a.year)
        : feeItemLabel('Fee', a.month, a.year);
    return { label, amount: a.amount || 0 };
  });
  return {
    receiptNumber: fp.receiptNumber,
    paidDate: fp.paymentDate,
    studentName: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
    fatherName: student.parent?.fatherName || student.parent?.guardianName || '—',
    admissionNumber: student.admissionNumber || '—',
    rollNumber: student.rollNumber || '—',
    className: `${student.classId?.name || ''}${student.sectionId?.name ? ' / ' + student.sectionId.name : ''}`,
    paymentMethod: fp.paymentMethod,
    remarks: fp.remarks,
    items,
    totalAmount: fp.totalAmount,
  };
}

export default function ReceiptRegister() {
  const formatMoney = useFormatMoney();
  const { symbol: currencySymbol } = useCurrencyMeta();
  const { data: org } = useGetMyOrganizationQuery();
  const today = getBusinessToday();
  const firstOfMonth = `${today.slice(0, 7)}-01`;

  const [filters, setFilters] = useState({
    startDate: firstOfMonth,
    endDate: today,
    paymentMethod: 'all',
    status: 'all',
    search: '',
    page: 1,
  });

  const queryParams: any = { page: filters.page, limit: 25, startDate: filters.startDate, endDate: filters.endDate };
  if (filters.paymentMethod !== 'all') queryParams.paymentMethod = filters.paymentMethod;
  if (filters.status !== 'all') queryParams.status = filters.status;
  if (filters.search.trim()) queryParams.search = filters.search.trim();

  const { data, isLoading } = useGetFeeReceiptsQuery(queryParams);
  const receipts = data?.results || [];

  const [viewId, setViewId] = useState<string | null>(null);
  const { data: viewReceipt, isFetching: loadingView } = useGetFeeReceiptQuery(viewId as string, { skip: !viewId });

  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReceipt, { isLoading: cancelling }] = useCancelFeeReceiptMutation();

  const [confirmBackfill, setConfirmBackfill] = useState(false);
  const [backfill, { isLoading: backfilling }] = useBackfillFeeReceiptsMutation();

  const handleBackfill = async () => {
    try {
      const result = await backfill(undefined).unwrap();
      toast.success(result?.message || 'Backfill complete');
      setConfirmBackfill(false);
    } catch (err: any) {
      toast.error(err?.data?.message || 'Backfill failed');
    }
  };

  const handlePrint = (fp: any) => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(buildReceiptPrintHTML(toPrintablePayment(fp), org?.name || 'School', currencySymbol));
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await cancelReceipt({ id: cancelTarget.id || cancelTarget._id, reason: cancelReason }).unwrap();
      toast.success(`Receipt ${cancelTarget.receiptNumber} cancelled`);
      setCancelTarget(null);
      setCancelReason('');
    } catch (err: any) {
      toast.error(err?.data?.message || 'Cancel failed');
    }
  };

  const rows = receipts.map((fp: any) => [
    fp.receiptNumber,
    formatBusinessDate(fp.paymentDate),
    `${fp.studentId?.firstName || ''} ${fp.studentId?.lastName || ''}`.trim(),
    fp.studentId?.classId?.name || '—',
    (fp.paymentMethod || '').replace('_', ' '),
    monthsLabel(fp.allocations),
    formatMoney(fp.totalAmount || 0),
    fp.status,
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ReceiptIcon className="h-4 w-4" /> Receipt Register
          </h2>
          <p className="text-xs text-muted-foreground">Every fee receipt issued, with the fee month(s) it settled</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setConfirmBackfill(true)} title="Reconstruct receipts for payments recorded before the Receipt Register existed">
            <History className="mr-1.5 h-3.5 w-3.5" /> Backfill Historical Receipts
          </Button>
          <ExportButtons
          data={receipts.map((fp: any) => ({
            Receipt: fp.receiptNumber,
            Date: formatBusinessDate(fp.paymentDate),
            Student: `${fp.studentId?.firstName || ''} ${fp.studentId?.lastName || ''}`.trim(),
            Class: fp.studentId?.classId?.name || '',
            Method: fp.paymentMethod,
            'Fee Month(s)': monthsLabel(fp.allocations),
            Amount: fp.totalAmount,
            Status: fp.status,
          }))}
          sheetName="Receipts"
          fileName="receipt-register"
          pdfTitle="Receipt Register"
          headers={['Receipt #', 'Date', 'Student', 'Class', 'Method', 'Fee Month(s)', 'Amount', 'Status']}
          rows={rows}
          landscape
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">From</span>
          <Input type="date" className="w-36 h-9" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value, page: 1 })} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">To</span>
          <Input type="date" className="w-36 h-9" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value, page: 1 })} />
        </div>
        <Select value={filters.paymentMethod} onValueChange={(v) => setFilters({ ...filters, paymentMethod: v, page: 1 })}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Method" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Methods</SelectItem>
            {PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v, page: 1 })}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Receipt # or student…"
            className="w-56 h-9 pl-8"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <Loading />
      ) : receipts.length === 0 ? (
        <EmptyState text="No receipts found for this period." />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-2 font-medium text-xs">Receipt #</th>
                <th className="text-left px-4 py-2 font-medium text-xs">Date</th>
                <th className="text-left px-4 py-2 font-medium text-xs">Student</th>
                <th className="text-left px-4 py-2 font-medium text-xs">Class</th>
                <th className="text-left px-4 py-2 font-medium text-xs">Method</th>
                <th className="text-left px-4 py-2 font-medium text-xs">Fee Month(s)</th>
                <th className="text-right px-4 py-2 font-medium text-xs">Amount</th>
                <th className="text-left px-4 py-2 font-medium text-xs">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {receipts.map((fp: any) => {
                const id = fp.id || fp._id;
                const cancelled = fp.status === 'cancelled';
                return (
                  <tr key={id} className={`border-b hover:bg-muted/20 transition-colors ${cancelled ? 'opacity-60' : ''}`}>
                    <td className={`px-4 py-2 text-xs font-mono ${cancelled ? 'line-through' : ''}`}>{fp.receiptNumber}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{formatBusinessDate(fp.paymentDate)}</td>
                    <td className="px-4 py-2 text-xs">{`${fp.studentId?.firstName || ''} ${fp.studentId?.lastName || ''}`.trim() || '—'}</td>
                    <td className="px-4 py-2 text-xs">{fp.studentId?.classId?.name || '—'}</td>
                    <td className="px-4 py-2 text-xs capitalize">{(fp.paymentMethod || '').replace('_', ' ')}</td>
                    <td className="px-4 py-2 text-xs">{monthsLabel(fp.allocations)}</td>
                    <td className="px-4 py-2 text-xs text-right font-semibold">{formatMoney(fp.totalAmount || 0)}</td>
                    <td className="px-4 py-2"><ReceiptStatusBadge status={fp.status} /></td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="View" onClick={() => setViewId(id)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Print" onClick={() => handlePrint(fp)} disabled={cancelled}>
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                        {!cancelled && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title="Cancel Receipt"
                            onClick={() => setCancelTarget(fp)}
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={filters.page === 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Prev</Button>
          <span className="text-sm py-1.5">Page {filters.page} / {data.totalPages}</span>
          <Button variant="outline" size="sm" disabled={filters.page >= data.totalPages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Next</Button>
        </div>
      )}

      {/* View Dialog */}
      <Dialog open={!!viewId} onOpenChange={(open) => !open && setViewId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ReceiptIcon className="h-4 w-4" /> Receipt {viewReceipt?.receiptNumber}
            </DialogTitle>
          </DialogHeader>
          {loadingView ? (
            <Loading />
          ) : viewReceipt ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Student</span>
                <span className="font-medium">
                  {`${viewReceipt.studentId?.firstName || ''} ${viewReceipt.studentId?.lastName || ''}`.trim()}
                  {viewReceipt.studentId?.classId?.name ? ` · ${viewReceipt.studentId.classId.name}` : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Collected On</span>
                <span>{formatBusinessDateTimeShort(viewReceipt.paymentDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Method</span>
                <span className="capitalize">{(viewReceipt.paymentMethod || '').replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Collected By</span>
                <span>{viewReceipt.collectedBy?.name || '—'}</span>
              </div>
              <div className="rounded-lg border divide-y">
                {(viewReceipt.allocations || []).map((a: any, i: number) => (
                  <div key={i} className="flex justify-between px-3 py-1.5 text-xs">
                    <span>{a.month} {a.year}</span>
                    <span className="font-semibold">{formatMoney(a.amount || 0)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-bold border-t pt-2">
                <span>Total Received</span>
                <span>{formatMoney(viewReceipt.totalAmount || 0)}</span>
              </div>
              {viewReceipt.status === 'cancelled' && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                  Cancelled{viewReceipt.cancelledAt ? ` on ${formatBusinessDate(viewReceipt.cancelledAt)}` : ''}
                  {viewReceipt.cancelReason ? ` — ${viewReceipt.cancelReason}` : ''}
                </div>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewId(null)}>Close</Button>
            {viewReceipt && viewReceipt.status !== 'cancelled' && (
              <Button onClick={() => handlePrint(viewReceipt)}>
                <Printer className="mr-2 h-3.5 w-3.5" /> Print
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirm */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel receipt {cancelTarget?.receiptNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              This reverses the {formatMoney(cancelTarget?.totalAmount || 0)} it applied — the covered voucher(s) return to
              unpaid/partial, and any wallet credit it moved is reversed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Textarea
              placeholder="Reason for cancelling (optional but recommended)…"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={2}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={cancelling} className="bg-destructive hover:bg-destructive/90">
              {cancelling ? 'Cancelling…' : 'Cancel Receipt'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Backfill Confirm */}
      <AlertDialog open={confirmBackfill} onOpenChange={(open) => !open && setConfirmBackfill(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Backfill historical receipts?</AlertDialogTitle>
            <AlertDialogDescription>
              Reconstructs a receipt (with a real receipt number) for every fee payment recorded before the Receipt
              Register existed, so past collections show up correctly in reports and the dashboard. Safe to re-run —
              it only creates receipts for payments that don't have one yet, and never touches existing vouchers or
              transactions. This may take a while for a large history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBackfill} disabled={backfilling}>
              {backfilling ? 'Backfilling…' : 'Run Backfill'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
