/**
 * Fee Payment Approvals — admins review online fee payments submitted by
 * parents/students (with proof screenshot) and approve or reject them.
 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Wallet, CheckCircle2, XCircle, Hourglass, ImageIcon, Eye,
} from 'lucide-react';
import {
  useGetFeePaymentRequestsQuery,
  useApproveFeePaymentRequestMutation,
  useRejectFeePaymentRequestMutation,
} from '@/stores/school.api';

const STATUS_TABS = [
  { key: 'pending', label: 'Pending', icon: Hourglass },
  { key: 'approved', label: 'Approved', icon: CheckCircle2 },
  { key: 'rejected', label: 'Rejected', icon: XCircle },
  { key: 'all', label: 'All', icon: Wallet },
] as const;

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

function formatDate(value: unknown): string {
  if (!value) return '—';
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function voucherLabel(r: any): string {
  const summary = r.voucherSummary || [];
  if (summary.length === 0) return '—';
  return summary.map((v: any) => v.period || v.voucherNumber).filter(Boolean).join(', ');
}

export default function PaymentApprovals() {
  const [status, setStatus] = useState<string>('pending');
  const params = status === 'all' ? { limit: 100, sortBy: 'createdAt:desc' } : { status, limit: 100, sortBy: 'createdAt:desc' };
  const { data, isFetching } = useGetFeePaymentRequestsQuery(params);
  const requests = data?.results || [];

  const [approve, { isLoading: approving }] = useApproveFeePaymentRequestMutation();
  const [reject, { isLoading: rejecting }] = useRejectFeePaymentRequestMutation();

  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);

  const handleApprove = async (r: any) => {
    try {
      await approve({ id: r.id || r._id }).unwrap();
      toast.success('Payment approved — vouchers marked paid');
      setDetail(null);
    } catch (e: any) {
      toast.error(e?.data?.message || 'Failed to approve');
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    try {
      await reject({ id: rejectTarget.id || rejectTarget._id, note: rejectNote }).unwrap();
      toast.success('Payment rejected');
      setRejectTarget(null);
      setRejectNote('');
      setDetail(null);
    } catch (e: any) {
      toast.error(e?.data?.message || 'Failed to reject');
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wallet className="h-6 w-6 text-blue-600" /> Online Fee Payments
        </h1>
        <p className="text-muted-foreground text-sm">Review payment proofs submitted by parents and approve to mark vouchers paid.</p>
      </div>

      <div className="flex gap-1 flex-wrap">
        {STATUS_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <Button key={t.key} size="sm" variant={status === t.key ? 'default' : 'outline'}
              className="h-8 gap-1.5" onClick={() => setStatus(t.key)}>
              <Icon className="h-4 w-4" /> {t.label}
            </Button>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          {isFetching ? (
            <p className="text-sm text-muted-foreground py-10 text-center animate-pulse">Loading…</p>
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              No {status === 'all' ? '' : status} payment requests.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-muted-foreground">
                    <th className="text-left py-2.5 px-3 font-medium">Date</th>
                    <th className="text-left py-2.5 px-3 font-medium">Student</th>
                    <th className="text-left py-2.5 px-3 font-medium hidden md:table-cell">Vouchers</th>
                    <th className="text-right py-2.5 px-3 font-medium">Amount</th>
                    <th className="text-left py-2.5 px-3 font-medium hidden lg:table-cell">Ref / Sender</th>
                    <th className="text-center py-2.5 px-3 font-medium">Proof</th>
                    <th className="text-center py-2.5 px-3 font-medium">Status</th>
                    <th className="text-right py-2.5 px-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r: any) => {
                    const student = r.studentId || {};
                    const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || '—';
                    return (
                      <tr key={r.id || r._id} className="border-b hover:bg-muted/20">
                        <td className="py-2 px-3 whitespace-nowrap text-muted-foreground">
                          {formatDate(r.createdAt)}
                        </td>
                        <td className="py-2 px-3">
                          <p className="font-medium leading-tight">{studentName}</p>
                          <p className="text-xs text-muted-foreground">
                            {student.admissionNumber ? `Adm ${student.admissionNumber}` : ''}
                            {student.rollNumber ? ` · ${student.rollNumber}` : ''}
                          </p>
                        </td>
                        <td className="py-2 px-3 hidden md:table-cell text-muted-foreground max-w-[180px] truncate" title={voucherLabel(r)}>
                          {voucherLabel(r)}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold whitespace-nowrap">
                          Rs. {(r.amount || 0).toLocaleString()}
                        </td>
                        <td className="py-2 px-3 hidden lg:table-cell text-xs text-muted-foreground">
                          {r.transactionRef && <p>Ref: {r.transactionRef}</p>}
                          {r.senderName && <p>{r.senderName}</p>}
                          {!r.transactionRef && !r.senderName && '—'}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {r.screenshot?.url ? (
                            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1"
                              onClick={() => setPreview(r.screenshot.url)}>
                              <ImageIcon className="h-3.5 w-3.5" /> View
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold capitalize ${STATUS_BADGE[r.status] || 'bg-gray-100'}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setDetail(r)}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {r.status === 'pending' && (
                              <>
                                <Button size="sm" className="h-7 px-2 text-xs" disabled={approving}
                                  onClick={() => handleApprove(r)}>
                                  Approve
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-red-600 border-red-200"
                                  onClick={() => setRejectTarget(r)}>
                                  Reject
                                </Button>
                              </>
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
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Payment Details</DialogTitle></DialogHeader>
          {detail && (() => {
            const student = detail.studentId || {};
            const summary = detail.voucherSummary || [];
            return (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><p className="text-xs text-muted-foreground">Student</p><p className="font-medium">{student.firstName} {student.lastName || ''}</p></div>
                  <div><p className="text-xs text-muted-foreground">Amount</p><p className="font-bold">Rs. {(detail.amount || 0).toLocaleString()}</p></div>
                  <div><p className="text-xs text-muted-foreground">Submitted</p><p>{formatDate(detail.createdAt)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Status</p>
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold capitalize ${STATUS_BADGE[detail.status] || ''}`}>{detail.status}</span>
                  </div>
                </div>
                {summary.length > 0 && (
                  <div className="border rounded-lg p-2 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground">Vouchers</p>
                    {summary.map((v: any, i: number) => (
                      <div key={i} className="flex justify-between">
                        <span>{v.period || v.voucherNumber}</span>
                        <span>Rs. {(v.amount || 0).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
                {(detail.bankAccountLabel || detail.senderName || detail.transactionRef || detail.note) && (
                  <div className="text-xs text-muted-foreground space-y-0.5 border-t pt-2">
                    {detail.bankAccountLabel && <p>Paid to: <span className="text-foreground">{detail.bankAccountLabel}</span></p>}
                    {detail.senderName && <p>Sender: <span className="text-foreground">{detail.senderName}</span></p>}
                    {detail.transactionRef && <p>Ref: <span className="text-foreground">{detail.transactionRef}</span></p>}
                    {detail.note && <p>Note: <span className="text-foreground">{detail.note}</span></p>}
                    {detail.reviewNote && detail.status !== 'pending' && <p>Review: <span className="text-foreground">{detail.reviewNote}</span></p>}
                  </div>
                )}
                {detail.screenshot?.url && (
                  <button type="button" onClick={() => setPreview(detail.screenshot.url)} className="w-full">
                    <img src={detail.screenshot.url} alt="proof" className="w-full max-h-32 object-contain rounded border" />
                    <span className="text-xs text-blue-600 mt-1 inline-block">Click to enlarge</span>
                  </button>
                )}
                {detail.status === 'pending' && (
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" className="text-red-600" onClick={() => { setRejectTarget(detail); setDetail(null); }}>Reject</Button>
                    <Button disabled={approving} onClick={() => handleApprove(detail)}>Approve & Mark Paid</Button>
                  </DialogFooter>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectNote(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Payment</DialogTitle></DialogHeader>
          <Textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={3}
            placeholder="Reason (shown to the parent), e.g. screenshot unclear / amount mismatch…" />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectNote(''); }}>Cancel</Button>
            <Button variant="destructive" disabled={rejecting} onClick={handleReject}>Reject Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Screenshot preview */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Payment Screenshot</DialogTitle></DialogHeader>
          {preview && <img src={preview} alt="payment proof" className="w-full max-h-[70vh] object-contain rounded-lg" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
