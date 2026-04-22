import { useForm } from 'react-hook-form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAddVisitorFollowUpMutation } from '@/stores/school.api';
import { STATUS_OPTIONS } from './visitor-form';
import toast from 'react-hot-toast';

interface Props {
  visitorId: string;
  open: boolean;
  onClose: () => void;
}

interface FollowUpData {
  note: string;
  statusAfter: string;
  nextFollowUpDate: string;
}

export default function FollowUpDialog({ visitorId, open, onClose }: Props) {
  const [addFollowUp, { isLoading }] = useAddVisitorFollowUpMutation();
  const { register, handleSubmit, setValue, watch, reset } = useForm<FollowUpData>({
    defaultValues: { note: '', statusAfter: '', nextFollowUpDate: '' },
  });

  const statusAfter = watch('statusAfter');
  const NONE = 'no_change';

  const onSubmit = async (data: FollowUpData) => {
    try {
      const payload: any = { note: data.note };
      if (data.statusAfter && data.statusAfter !== NONE) payload.statusAfter = data.statusAfter;
      if (data.nextFollowUpDate) payload.nextFollowUpDate = data.nextFollowUpDate;

      await addFollowUp({ id: visitorId, ...payload }).unwrap();
      toast.success('Follow-up recorded');
      reset();
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to save follow-up');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md w-full">
        <DialogHeader>
          <DialogTitle>Add Follow-up</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label>Note <span className="text-destructive">*</span></Label>
            <Textarea {...register('note', { required: true })} rows={3} placeholder="What happened / what was discussed?" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Update Status</Label>
              <Select value={statusAfter} onValueChange={(v) => setValue('statusAfter', v)}>
                <SelectTrigger><SelectValue placeholder="— no change —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no_change">— no change —</SelectItem>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Next Follow-up</Label>
              <Input type="date" {...register('nextFollowUpDate')} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            <Button type="submit" disabled={isLoading} className="bg-blue-700 hover:bg-blue-800">
              {isLoading ? 'Saving…' : 'Save Follow-up'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
