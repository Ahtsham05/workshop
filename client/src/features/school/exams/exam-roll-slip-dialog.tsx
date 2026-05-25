import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useGetStudentsByClassQuery } from '@/stores/school.api';
import { useGetMyOrganizationQuery } from '@/stores/organization.api';
import { Printer, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { RootState } from '@/stores/store';
import { printRollSlips, type RollSlipStudent } from './roll-slip-print';

interface ExamRollSlipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exam: any | null;
  classId: string;
  className?: string;
}

export default function ExamRollSlipDialog({ open, onOpenChange, exam, classId, className }: ExamRollSlipDialogProps) {
  const [customNote, setCustomNote] = useState('');
  const user = useSelector((state: RootState) => state.auth.data?.user);
  const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId });
  const { data: students, isLoading } = useGetStudentsByClassQuery(classId, { skip: !open || !classId });

  const slipStudents: RollSlipStudent[] = useMemo(() => {
    return (students || []).map((s: any) => ({
      id: s.id || s._id,
      firstName: s.firstName,
      lastName: s.lastName,
      rollNumber: s.rollNumber,
      admissionNumber: s.admissionNumber,
      gender: s.gender,
      photoUrl: s.photoUrl,
      className: s.classId?.name || className,
      sectionName: s.sectionId?.name,
      fatherName: s.parent?.fatherName,
    }));
  }, [students, className]);

  const handlePrint = () => {
    if (!exam) return;
    const ok = printRollSlips({
      schoolName: org?.name || 'School',
      schoolLogo: org?.logo?.url,
      examName: exam.name,
      className: className || exam.classId?.name || '',
      customNote,
      students: slipStudents,
    });
    if (!ok) {
      toast.error('Could not open print window. Allow pop-ups and try again.');
      return;
    }
    toast.success(`Printing ${slipStudents.length} roll slips`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Print Roll Number Slips</DialogTitle>
        </DialogHeader>
        {exam && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
              <p><span className="text-muted-foreground">Exam:</span> <strong>{exam.name}</strong></p>
              <p><span className="text-muted-foreground">Class:</span> <strong>{className || exam.classId?.name}</strong></p>
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                {isLoading ? 'Loading students…' : `${slipStudents.length} slips will be printed (one per student)`}
              </p>
            </div>
            <div>
              <Label>Note on slip (optional)</Label>
              <Textarea
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder="e.g. Bring original CNIC copy. Reporting time 8:00 AM. Calculator not allowed."
                rows={4}
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">This note appears on every slip before printing.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handlePrint} disabled={isLoading || !slipStudents.length} className="gap-2">
                <Printer className="h-4 w-4" />
                Print {slipStudents.length} Slips
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
