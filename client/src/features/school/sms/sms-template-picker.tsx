import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useGetSchoolSmsTemplatesQuery,
  useDeleteSchoolSmsTemplateMutation,
  type SchoolSmsTemplate,
} from '@/stores/school.api';
import { toast } from 'sonner';
import { FileText, Loader2, Search, Trash2 } from 'lucide-react';

/**
 * Template library. Every card shows the message as a parent receives it — placeholders
 * already filled in — because `Dear Parent, {feeType} fee of Rs {amount}...` tells a school
 * nothing about whether the wording reads well or how much it will cost to send.
 *
 * Templates are filtered by `context`: the Broadcast and Bulk tabs cannot resolve the fee
 * voucher placeholders, so fee templates are simply not offered there.
 */
export function SmsTemplatePicker({
  open,
  onOpenChange,
  context,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: 'broadcast' | 'fee_alert';
  onPick: (template: SchoolSmsTemplate) => void;
}) {
  const { data, isLoading } = useGetSchoolSmsTemplatesQuery(undefined, { skip: !open });
  const [deleteTemplate, { isLoading: deleting }] = useDeleteSchoolSmsTemplateMutation();
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const all = data?.templates ?? [];
    // Fee Alerts may also use plain broadcast wording; Broadcast may not use fee wording.
    const forContext = context === 'fee_alert' ? all : all.filter((t) => t.context === 'broadcast');
    const byCategory = category === 'all' ? forContext : forContext.filter((t) => t.category === category);
    const q = search.trim().toLowerCase();
    if (!q) return byCategory;
    return byCategory.filter(
      (t) => t.title.toLowerCase().includes(q) || t.preview.toLowerCase().includes(q)
    );
  }, [data, context, category, search]);

  const categories = useMemo(() => {
    const present = new Set(
      (data?.templates ?? [])
        .filter((t) => (context === 'fee_alert' ? true : t.context === 'broadcast'))
        .map((t) => t.category)
    );
    return (data?.categories ?? []).filter((c) => present.has(c));
  }, [data, context]);

  async function handleDelete(template: SchoolSmsTemplate) {
    try {
      await deleteTemplate(template.id).unwrap();
      toast.success('Template deleted');
    } catch (e: any) {
      toast.error(e?.data?.message || 'Could not delete template');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Choose a message template</DialogTitle>
          <DialogDescription>
            Shown exactly as a parent will receive it. Pick one, then edit the wording however you
            like before sending.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              className="pl-8"
              placeholder="Search templates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategory('all')}
              className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
                category === 'all'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
              }`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
                  category === c
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="max-h-[52vh] overflow-y-auto space-y-2 pr-1">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading templates…
              </div>
            ) : visible.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">No templates match.</p>
            ) : (
              visible.map((t) => (
                <div key={t.id} className="rounded-md border p-3 space-y-2 hover:border-blue-300 transition-colors">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="text-sm font-medium text-gray-900 truncate">{t.title}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {t.category}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${t.encoding === 'UCS-2' ? 'border-amber-300 text-amber-700' : ''}`}
                      >
                        {t.segments} SMS · {t.encoding}
                      </Badge>
                      {!t.builtIn && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          disabled={deleting}
                          onClick={() => handleDelete(t)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="h-7 bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => {
                          onPick(t);
                          onOpenChange(false);
                        }}
                      >
                        Use
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-700 bg-gray-50 border rounded px-2.5 py-2 whitespace-pre-wrap">
                    {t.preview}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
