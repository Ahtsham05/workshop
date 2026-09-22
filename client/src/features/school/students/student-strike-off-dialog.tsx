import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, UserX, Loader2 } from 'lucide-react';
import { useGetStudentFeeSummaryQuery, useStruckOffStudentMutation } from '@/stores/school.api';
import { useFormatMoney } from '@/lib/format-money';
import { toast } from 'sonner';

const REASONS = [
  { value: 'fee_default', label: 'Fee Default (non-payment)' },
  { value: 'withdrawn', label: 'Parent Withdrew Admission' },
  { value: 'relocation', label: 'Relocation / Moved City' },
  { value: 'disciplinary', label: 'Disciplinary Action' },
  { value: 'academic', label: 'Academic Reasons' },
  { value: 'other', label: 'Other' },
];

interface Props {
  studentId: string;
  studentName: string;
  admissionNumber?: string;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function StudentStrikeOffDialog({ studentId, studentName, admissionNumber, open, onClose, onSuccess }: Props) {
  const formatMoney = useFormatMoney();
  const { data: feeSummary, isLoading: loadingFees } = useGetStudentFeeSummaryQuery(studentId, { skip: !open });
  const [struckOffStudent, { isLoading: submitting }] = useStruckOffStudentMutation();

  const [reason, setReason] = useState('fee_default');
  const [leftDate, setLeftDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [remarks, setRemarks] = useState('');
  const [tcNumber, setTcNumber] = useState('');

  // Reset the form each time the dialog is opened for a (possibly different) student
  useEffect(() => {
    if (open) {
      setReason('fee_default');
      setLeftDate(new Date().toISOString().split('T')[0]);
      setRemarks('');
      setTcNumber('');
    }
  }, [open, studentId]);

  const pendingAmount = feeSummary?.totalPending || 0;

  const handleConfirm = async () => {
    try {
      await struckOffStudent({ id: studentId, leftDate, reason, remarks, tcNumber }).unwrap();
      toast.success(`${studentName} marked as struck off / left`);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to update student status');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-red-600" />
            Mark Student as Left / Struck Off
          </DialogTitle>
          <DialogDescription>
            {studentName} {admissionNumber ? `· #${admissionNumber}` : ''} will be removed from active rolls. All fee and academic history is kept.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {!loadingFees && pendingAmount > 0 && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-700 text-sm">
                This student has <strong>{formatMoney(pendingAmount)}</strong> in unpaid fees. The amount will be
                recorded against this leaving record and still shown as pending in fee reports until paid or written off.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label>Reason for Leaving <span className="text-destructive">*</span></Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Leaving Date</Label>
              <Input type="date" value={leftDate} onChange={(e) => setLeftDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>TC Number <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input placeholder="e.g. TC-2026-045" value={tcNumber} onChange={(e) => setTcNumber(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Remarks <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea rows={2} placeholder="Any additional notes…" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserX className="mr-2 h-4 w-4" />}
            {submitting ? 'Saving…' : 'Confirm — Mark as Left'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
