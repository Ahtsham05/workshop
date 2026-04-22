import { Printer, FileDown, Wand2, Layers, CalendarDays, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClassSelector } from './ClassSelector';

export type TimetableView = 'class' | 'teacher';

interface TimetableHeaderProps {
  view: TimetableView;
  onViewChange: (view: TimetableView) => void;

  /** Class selector state */
  classId: string;
  sectionId: string;
  onClassChange: (id: string) => void;
  onSectionChange: (id: string) => void;

  /** Actions */
  onAutoGenerate: () => void;
  onBulkGenerate: () => void;
  onPrint: () => void;
  onExportPdf: () => void;

  /** Loading flags */
  isAutoGenerating: boolean;
  isBulkGenerating: boolean;
}

/**
 * Page-level header for the Timetable module.
 *
 * Contains:
 * - Title + "Smart Scheduler" badge
 * - Class View / Teacher View toggle
 * - Class + Section selectors (hidden in Teacher view)
 * - Auto Fill, Bulk Generate, Print, Export PDF action buttons
 *
 * The entire header is `print:hidden` so it never appears in printed output.
 */
export function TimetableHeader({
  view,
  onViewChange,
  classId,
  sectionId,
  onClassChange,
  onSectionChange,
  onAutoGenerate,
  onBulkGenerate,
  onPrint,
  onExportPdf,
  isAutoGenerating,
  isBulkGenerating,
}: TimetableHeaderProps) {
  const anyLoading = isAutoGenerating || isBulkGenerating;

  return (
    <div className="print:hidden space-y-4">
      {/* ── Row 1: title + view toggle ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Class Timetable</h1>
            <Badge
              variant="secondary"
              className="text-[10px] font-semibold bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-700 border border-indigo-200 px-2"
            >
              Smart Scheduler
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5 ml-8">
            Automated, conflict-free weekly schedules
          </p>
        </div>

        {/* View toggle */}
        <Tabs value={view} onValueChange={(v) => onViewChange(v as TimetableView)}>
          <TabsList className="h-9 text-xs">
            <TabsTrigger value="class" className="px-4 text-xs">
              Class View
            </TabsTrigger>
            <TabsTrigger value="teacher" className="px-4 text-xs">
              Teacher View
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* ── Row 2: selectors + action buttons ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Class + Section selectors (only visible in class view) */}
        {view === 'class' ? (
          <ClassSelector
            classId={classId}
            sectionId={sectionId}
            onClassChange={onClassChange}
            onSectionChange={onSectionChange}
            disabled={anyLoading}
          />
        ) : (
          <div /> /* spacer */
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Auto Fill */}
          <Button
            size="sm"
            disabled={view !== 'class' || !classId || isAutoGenerating}
            onClick={onAutoGenerate}
            className={
              'gap-1.5 text-white border-0 ' +
              'bg-gradient-to-r from-indigo-500 to-violet-500 ' +
              'hover:from-indigo-600 hover:to-violet-600 ' +
              'disabled:opacity-50 disabled:cursor-not-allowed'
            }
          >
            {isAutoGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
            Auto Fill Timetable
          </Button>

          {/* Bulk Generate */}
          <Button
            size="sm"
            variant="outline"
            disabled={isBulkGenerating}
            onClick={onBulkGenerate}
            className="gap-1.5"
          >
            {isBulkGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Layers className="h-3.5 w-3.5" />
            )}
            Generate All
          </Button>

          {/* Divider */}
          <div className="h-6 w-px bg-border/60" />

          {/* Print */}
          <Button
            size="sm"
            variant="ghost"
            onClick={onPrint}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>

          {/* Export PDF */}
          <Button
            size="sm"
            variant="ghost"
            onClick={onExportPdf}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <FileDown className="h-3.5 w-3.5" />
            Export PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
