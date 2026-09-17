import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { useGetMyOrganizationQuery } from '@/stores/organization.api';
import { useBranchPaperSize, useBranchPrintOrientation } from '@/features/invoice/utils/paper-format';
import { useCreateSchoolTransactionsBulkMutation } from '@/stores/school.api';
import { useFormatMoney, useCurrencyMeta } from '@/lib/format-money';
import { CategoryCombobox } from './category-combobox';
import { printExpenseVoucher } from './print-expense-voucher';
import { onEnterAdvance, afterPaint, focusField } from '@/lib/invoice-form-keyboard';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'online', label: 'Online' },
  { value: 'other', label: 'Other' },
];

const today = () => new Date().toISOString().slice(0, 10);

type Row = { id: string; categoryId: string; amount: string; reference: string; description: string };

let rowSeq = 0;
const makeRow = (): Row => ({ id: `line-${++rowSeq}`, categoryId: '', amount: '', reference: '', description: '' });

export function BulkExpensesDialog({
  open,
  onOpenChange,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: any[];
}) {
  const formatMoney = useFormatMoney();
  const currencyMeta = useCurrencyMeta();
  const { data: org } = useGetMyOrganizationQuery();
  const paperSize = useBranchPaperSize();
  const orientation = useBranchPrintOrientation();

  const [date, setDate] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [rows, setRows] = useState<Row[]>(() => [makeRow(), makeRow()]);
  const [createBulk, { isLoading }] = useCreateSchoolTransactionsBulkMutation();

  const categoryTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const amountRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const referenceRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const descriptionRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const setRow = (id: string, patch: Partial<Row>) => {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };
  const removeRow = (id: string) => setRows((r) => r.filter((row) => row.id !== id));

  const total = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const reset = () => {
    setDate(today());
    setPaymentMethod('cash');
    setRows([makeRow(), makeRow()]);
  };

  // Enter-to-advance chain, mirroring the invoice item grid: Category → Amount →
  // Reference → Description → (last row) add a new row and focus its category
  // picker, or (mid row) focus the next row's category picker. We only ever
  // FOCUS the (closed) category trigger here, never auto-open its popover —
  // auto-opening meant a still-highlighted item (e.g. the first category)
  // could get silently selected by a stray follow-up Enter before the user
  // even looked at that row.
  const advanceAfterCategory = (rowId: string) => focusField(amountRefs.current[rowId]);
  const advanceAfterAmount = (rowId: string) => focusField(referenceRefs.current[rowId]);
  const advanceAfterReference = (rowId: string) => focusField(descriptionRefs.current[rowId]);

  const advanceAfterDescription = (rowId: string) => {
    const idx = rows.findIndex((r) => r.id === rowId);
    if (idx === rows.length - 1) {
      const newRow = makeRow();
      setRows((r) => [...r, newRow]);
      // The new row's trigger ref doesn't exist yet in this tick — defer the
      // ref lookup itself (not just the .focus() call) until after it mounts.
      afterPaint(() => focusField(categoryTriggerRefs.current[newRow.id]));
    } else {
      focusField(categoryTriggerRefs.current[rows[idx + 1].id]);
    }
  };

  const handlePrint = (voucherNumber: string, transactions: any[]) => {
    try {
      printExpenseVoucher(
        voucherNumber,
        date,
        paymentMethod,
        transactions.map((t) => ({
          categoryName: t.categoryId?.name,
          description: t.description,
          amount: t.amount,
        })),
        { name: org?.name || 'School', address: org?.address, phone: org?.phone, currencyMeta },
        paperSize,
        orientation,
      );
    } catch (err: any) {
      toast.error(err?.message || 'Unable to open the print window — check your popup blocker');
    }
  };

  const handleSave = async () => {
    const items = rows.filter((r) => r.amount && Number(r.amount) > 0);
    if (items.length === 0) return toast.error('Add at least one expense line with an amount');

    try {
      const result = await createBulk({
        date,
        paymentMethod,
        items: items.map((r) => ({
          categoryId: r.categoryId || undefined,
          amount: Number(r.amount),
          reference: r.reference.trim() || undefined,
          description: r.description.trim() || 'Expense',
        })),
      }).unwrap();

      toast.success(`Voucher ${result.voucherNumber} created — ${items.length} expenses, ${formatMoney(result.totalAmount)}`, {
        action: {
          label: 'Print Voucher',
          onClick: () => handlePrint(result.voucherNumber, result.transactions),
        },
      });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to save expenses');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-[96vw] sm:max-w-[95vw] xl:max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Expense Voucher</DialogTitle>
          <DialogDescription>Record several expenses at once — they'll share one voucher number you can print. Press Enter to move field to field.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-44">
              <Label>Voucher Date</Label>
              <Input type="date" className="mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="w-48">
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[minmax(200px,1.4fr)_130px_160px_minmax(260px,2fr)_36px] gap-2 px-1 pb-1.5 text-xs font-medium text-muted-foreground">
                <span>Category</span>
                <span>Amount *</span>
                <span>Voucher/Ref #</span>
                <span>Description</span>
                <span />
              </div>
              <div className="space-y-1.5">
                {rows.map((row) => (
                  <div key={row.id} className="grid grid-cols-[minmax(200px,1.4fr)_130px_160px_minmax(260px,2fr)_36px] gap-2 items-center">
                    <CategoryCombobox
                      ref={(el) => { categoryTriggerRefs.current[row.id] = el; }}
                      categories={categories}
                      value={row.categoryId}
                      onChange={(id) => { setRow(row.id, { categoryId: id }); advanceAfterCategory(row.id); }}
                      placeholder="Select or create"
                    />
                    <Input
                      ref={(el) => { amountRefs.current[row.id] = el; }}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={row.amount}
                      onChange={(e) => setRow(row.id, { amount: e.target.value })}
                      onKeyDown={(e) => onEnterAdvance(e, () => advanceAfterAmount(row.id))}
                    />
                    <Input
                      ref={(el) => { referenceRefs.current[row.id] = el; }}
                      placeholder="Optional"
                      value={row.reference}
                      onChange={(e) => setRow(row.id, { reference: e.target.value })}
                      onKeyDown={(e) => onEnterAdvance(e, () => advanceAfterReference(row.id))}
                    />
                    <Input
                      ref={(el) => { descriptionRefs.current[row.id] = el; }}
                      placeholder="What was this expense for? (optional)"
                      value={row.description}
                      onChange={(e) => setRow(row.id, { description: e.target.value })}
                      onKeyDown={(e) => onEnterAdvance(e, () => advanceAfterDescription(row.id))}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-destructive hover:text-destructive"
                      onClick={() => removeRow(row.id)}
                      disabled={rows.length <= 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { const newRow = makeRow(); setRows((r) => [...r, newRow]); afterPaint(() => focusField(categoryTriggerRefs.current[newRow.id])); }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Line
          </Button>
        </div>
        <DialogFooter className="items-center sm:justify-between">
          <span className="text-sm font-semibold">Total: {formatMoney(total)}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? 'Saving…' : <><Printer className="mr-1.5 h-3.5 w-3.5" /> Save Voucher</>}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
