import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AlertCircle } from 'lucide-react';
import { useCreateVisitorMutation, useUpdateVisitorMutation, useCheckVisitorDuplicateQuery } from '@/stores/school.api';
import toast from 'react-hot-toast';

// ─── constants ───────────────────────────────────────────────────────────────

export const STATUS_OPTIONS = [
  { value: 'new', label: 'New', color: 'bg-blue-100 text-blue-700' },
  { value: 'contacted', label: 'Contacted', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'interested', label: 'Interested', color: 'bg-orange-100 text-orange-700' },
  { value: 'converted', label: 'Converted', color: 'bg-green-100 text-green-700' },
  { value: 'lost', label: 'Lost', color: 'bg-red-100 text-red-700' },
] as const;

export const SOURCE_OPTIONS = [
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'phone', label: 'Phone' },
  { value: 'referral', label: 'Referral' },
  { value: 'website', label: 'Website' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'newspaper', label: 'Newspaper' },
  { value: 'other', label: 'Other' },
] as const;

export function statusBadge(status: string) {
  const opt = STATUS_OPTIONS.find((s) => s.value === status);
  return opt ? (
    <Badge className={`${opt.color} capitalize`}>{opt.label}</Badge>
  ) : (
    <Badge>{status}</Badge>
  );
}

// ─── types ────────────────────────────────────────────────────────────────────

interface VisitorFormData {
  studentName: string;
  gender: string;
  dateOfBirth: string;
  desiredClass: string;
  previousSchool: string;
  parentName: string;
  phone: string;
  alternatePhone: string;
  email: string;
  address: string;
  source: string;
  referredBy: string;
  notes: string;
  status: string;
  nextFollowUpDate: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  visitor?: any; // pre-fill for edit
  prefill?: Partial<VisitorFormData>; // pre-fill for convert-from-visitor
}

// ─── component ───────────────────────────────────────────────────────────────

export default function VisitorForm({ open, onClose, visitor, prefill }: Props) {
  const isEdit = !!visitor;
  const [createVisitor, { isLoading: creating }] = useCreateVisitorMutation();
  const [updateVisitor, { isLoading: updating }] = useUpdateVisitorMutation();
  const loading = creating || updating;

  const [phoneInput, setPhoneInput] = useState('');

  const { data: dupCheck } = useCheckVisitorDuplicateQuery(
    { phone: phoneInput, excludeId: visitor?._id || visitor?.id },
    { skip: phoneInput.length < 7 }
  );

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<VisitorFormData>({
    defaultValues: {
      studentName: '', gender: 'male', dateOfBirth: '', desiredClass: '', previousSchool: '',
      parentName: '', phone: '', alternatePhone: '', email: '', address: '',
      source: 'walk_in', referredBy: '', notes: '', status: 'new', nextFollowUpDate: '',
    },
  });

  const phone = watch('phone');
  const source = watch('source');
  const status = watch('status');
  const gender = watch('gender');

  // Sync phone state for debounced duplicate check
  useEffect(() => {
    const t = setTimeout(() => setPhoneInput(phone || ''), 500);
    return () => clearTimeout(t);
  }, [phone]);

  // Pre-fill form when opening
  useEffect(() => {
    if (!open) return;
    if (visitor) {
      reset({
        studentName: visitor.studentName || '',
        gender: visitor.gender || 'male',
        dateOfBirth: visitor.dateOfBirth ? visitor.dateOfBirth.split('T')[0] : '',
        desiredClass: visitor.desiredClass || '',
        previousSchool: visitor.previousSchool || '',
        parentName: visitor.parentName || '',
        phone: visitor.phone || '',
        alternatePhone: visitor.alternatePhone || '',
        email: visitor.email || '',
        address: visitor.address || '',
        source: visitor.source || 'walk_in',
        referredBy: visitor.referredBy || '',
        notes: visitor.notes || '',
        status: visitor.status || 'new',
        nextFollowUpDate: visitor.nextFollowUpDate ? visitor.nextFollowUpDate.split('T')[0] : '',
      });
    } else if (prefill) {
      reset({ ...{ studentName: '', gender: 'male', dateOfBirth: '', desiredClass: '', previousSchool: '', parentName: '', phone: '', alternatePhone: '', email: '', address: '', source: 'walk_in', referredBy: '', notes: '', status: 'new', nextFollowUpDate: '' }, ...prefill });
    } else {
      reset({ studentName: '', gender: 'male', dateOfBirth: '', desiredClass: '', previousSchool: '', parentName: '', phone: '', alternatePhone: '', email: '', address: '', source: 'walk_in', referredBy: '', notes: '', status: 'new', nextFollowUpDate: '' });
    }
  }, [open, visitor, prefill, reset]);

  const onSubmit = async (data: VisitorFormData) => {
    if (dupCheck?.isDuplicate && !isEdit) {
      toast.error('A visitor with this phone number already exists.');
      return;
    }
    try {
      // Strip empty optional fields
      const payload: any = { ...data };
      ['dateOfBirth', 'alternatePhone', 'email', 'address', 'referredBy', 'notes', 'nextFollowUpDate', 'desiredClass', 'previousSchool'].forEach((k) => {
        if (!payload[k]) delete payload[k];
      });

      if (isEdit) {
        await updateVisitor({ id: visitor._id || visitor.id, ...payload }).unwrap();
        toast.success('Visitor updated');
      } else {
        await createVisitor(payload).unwrap();
        toast.success('Visitor added');
      }
      onClose();
    } catch (err: any) {
      const msg = err?.data?.message || 'Something went wrong';
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl w-full max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Visitor' : 'New Admission Inquiry'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* ── Student / Child ── */}
          <fieldset className="space-y-3 border rounded-lg p-4">
            <legend className="text-xs font-semibold uppercase tracking-wide text-blue-700 px-1">Student / Child Information</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Student Name <span className="text-destructive">*</span></Label>
                <Input {...register('studentName', { required: true })} placeholder="Full name" />
                {errors.studentName && <p className="text-xs text-destructive">Required</p>}
              </div>
              <div className="space-y-1">
                <Label>Gender</Label>
                <Select value={gender} onValueChange={(v) => setValue('gender', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Date of Birth</Label>
                <Input type="date" {...register('dateOfBirth')} />
              </div>
              <div className="space-y-1">
                <Label>Desired Class</Label>
                <Input {...register('desiredClass')} placeholder="e.g. Class 5" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Previous School</Label>
                <Input {...register('previousSchool')} placeholder="Previous school name (if any)" />
              </div>
            </div>
          </fieldset>

          {/* ── Parent / Guardian ── */}
          <fieldset className="space-y-3 border rounded-lg p-4">
            <legend className="text-xs font-semibold uppercase tracking-wide text-blue-700 px-1">Parent / Guardian</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Parent Name <span className="text-destructive">*</span></Label>
                <Input {...register('parentName', { required: true })} placeholder="Father / Guardian name" />
                {errors.parentName && <p className="text-xs text-destructive">Required</p>}
              </div>
              <div className="space-y-1">
                <Label>Phone <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Input
                    {...register('phone', { required: true })}
                    placeholder="+92 300 1234567"
                    className={dupCheck?.isDuplicate && !isEdit ? 'border-destructive pr-8' : ''}
                  />
                  {dupCheck?.isDuplicate && !isEdit && (
                    <AlertCircle className="absolute right-2 top-2.5 h-4 w-4 text-destructive" />
                  )}
                </div>
                {errors.phone && <p className="text-xs text-destructive">Required</p>}
                {dupCheck?.isDuplicate && !isEdit && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Duplicate: visitor with this phone already exists
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Alternate Phone</Label>
                <Input {...register('alternatePhone')} placeholder="Optional" />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" {...register('email')} placeholder="Optional" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Address</Label>
                <Input {...register('address')} placeholder="Home address" />
              </div>
            </div>
          </fieldset>

          {/* ── Inquiry Details ── */}
          <fieldset className="space-y-3 border rounded-lg p-4">
            <legend className="text-xs font-semibold uppercase tracking-wide text-blue-700 px-1">Inquiry Details</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Source</Label>
                <Select value={source} onValueChange={(v) => setValue('source', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOURCE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {source === 'referral' && (
                <div className="space-y-1">
                  <Label>Referred By</Label>
                  <Input {...register('referredBy')} placeholder="Name of referrer" />
                </div>
              )}
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setValue('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Next Follow-up Date</Label>
                <Input type="date" {...register('nextFollowUpDate')} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Notes</Label>
                <Textarea {...register('notes')} rows={3} placeholder="Any additional notes..." />
              </div>
            </div>
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" disabled={loading || (dupCheck?.isDuplicate && !isEdit)} className="bg-blue-700 hover:bg-blue-800">
              {loading ? 'Saving…' : isEdit ? 'Update' : 'Add Visitor'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
