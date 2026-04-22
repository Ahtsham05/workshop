import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, CheckCircle2 } from 'lucide-react';
import {
  useGetTimetableByClassQuery,
  useAutoGenerateTimetableMutation,
  useBulkGenerateTimetablesMutation,
} from '@/stores/school.api';

import { TimetableHeader, type TimetableView } from './components/TimetableHeader';
import { TimetableGrid } from './components/TimetableGrid';
import { TeacherScheduleView } from './components/TeacherScheduleView';
import { AutoGenerateWizard, type WizardResult, type WizardMode } from './components/AutoGenerateWizard';

// ─── Day coverage bar ────────────────────────────────────────────────────────

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const DAY_COLORS: Record<string, string> = {
  monday:    'bg-blue-100 text-blue-700 border-blue-200',
  tuesday:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  wednesday: 'bg-violet-100 text-violet-700 border-violet-200',
  thursday:  'bg-orange-100 text-orange-700 border-orange-200',
  friday:    'bg-rose-100 text-rose-700 border-rose-200',
  saturday:  'bg-gray-100 text-gray-600 border-gray-200',
};

function DayCoverage({ timetableList }: { timetableList: any[] }) {
  const configured = new Set(timetableList.map((t: any) => t.day));
  return (
    <div className="flex items-center gap-2 flex-wrap print:hidden">
      {DAYS.map((day) => {
        const active = configured.has(day);
        return (
          <span
            key={day}
            className={
              'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border capitalize ' +
              (active
                ? DAY_COLORS[day]
                : 'bg-muted/40 text-muted-foreground/50 border-border/30')
            }
          >
            {active && <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />}
            {day}
          </span>
        );
      })}
      <span className="text-xs text-muted-foreground ml-1">
        {configured.size} / {DAYS.length} days configured
      </span>
    </div>
  );
}

// ─── Empty states ────────────────────────────────────────────────────────────

function EmptyNoClass() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
      <CalendarDays className="h-16 w-16 mb-4 opacity-15" />
      <p className="text-lg font-medium">Select a class to view its timetable</p>
      <p className="text-sm mt-1 opacity-70">
        Choose a class from the dropdown above to load the schedule
      </p>
    </div>
  );
}

function EmptyNoTimetable({
  onAutoGenerate,
  isLoading,
}: {
  onAutoGenerate: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
      <CalendarDays className="h-16 w-16 mb-4 opacity-15" />
      <p className="text-lg font-medium">No timetable configured for this class</p>
      <p className="text-sm mt-1 mb-6 opacity-70">
        Use "Auto Fill Timetable" to generate a smart, conflict-free schedule automatically
      </p>
      <button
        disabled={isLoading}
        onClick={onAutoGenerate}
        className={
          'inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white ' +
          'bg-gradient-to-r from-indigo-500 to-violet-500 ' +
          'hover:from-indigo-600 hover:to-violet-600 ' +
          'transition-all shadow-md hover:shadow-lg ' +
          'disabled:opacity-50 disabled:cursor-not-allowed'
        }
      >
        Auto Fill Timetable
      </button>
    </div>
  );
}

// ─── Bulk generate results banner ─────────────────────────────────────────────

interface BulkResult {
  succeeded: number;
  failed: number;
  total: number;
}

function BulkResultBanner({ result, onDismiss }: { result: BulkResult; onDismiss: () => void }) {
  const allOk = result.failed === 0;
  return (
    <Card
      className={
        'border print:hidden ' +
        (allOk ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50')
      }
    >
      <CardContent className="py-3 px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className={
              allOk
                ? 'border-emerald-400 text-emerald-700 bg-emerald-100'
                : 'border-amber-400 text-amber-700 bg-amber-100'
            }
          >
            Bulk Generate
          </Badge>
          <span className={'text-sm font-medium ' + (allOk ? 'text-emerald-800' : 'text-amber-800')}>
            {allOk
              ? `All ${result.total} class timetables generated successfully`
              : `${result.succeeded} / ${result.total} generated · ${result.failed} failed`}
          </span>
        </div>
        <button
          onClick={onDismiss}
          className="text-xs text-muted-foreground hover:text-foreground underline shrink-0"
        >
          Dismiss
        </button>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TimetableManagement() {
  // ── State ──
  const [view, setView] = useState<TimetableView>('class');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<WizardMode>('single');

  // ── RTK Query ──
  const {
    data: timetableData,
    isLoading: timetableLoading,
    isFetching: timetableFetching,
  } = useGetTimetableByClassQuery(classId, { skip: !classId });

  const [autoGenerateTimetable, { isLoading: isAutoGenerating }] =
    useAutoGenerateTimetableMutation();
  const [bulkGenerateTimetables, { isLoading: isBulkGenerating }] =
    useBulkGenerateTimetablesMutation();

  const timetableList: any[] = Array.isArray(timetableData) ? timetableData : [];

  // ── Handlers ─────────────────────────────────────────────────────────────

  /** Opens the wizard modal for a single class. */
  const handleAutoGenerate = useCallback(() => {
    if (!classId) return;
    setWizardMode('single');
    setWizardOpen(true);
  }, [classId]);

  /** Opens the wizard modal for bulk (all classes) generation. */
  const handleBulkGenerate = useCallback(() => {
    setWizardMode('bulk');
    setWizardOpen(true);
  }, []);

  /** Called when the user confirms in the wizard. Routes to single or bulk API. */
  const handleWizardConfirm = useCallback(
    async ({ config: _config, slots }: WizardResult) => {
      if (wizardMode === 'single') {
        await autoGenerateTimetable({
          classId,
          ...(sectionId && { sectionId }),
          save: true,
          ...(slots.length > 0 && { timeSlots: slots }),
        }).unwrap();
        toast.success('Timetable generated successfully');
        setBulkResult(null);
      } else {
        // Bulk mode — pass time slots to bulk generate
        try {
          const result: any = await bulkGenerateTimetables({
            continueOnError: true,
            ...(slots.length > 0 && { timeSlots: slots }),
          }).unwrap();
          const summary: BulkResult = result?.summary ?? { succeeded: 0, failed: 0, total: 0 };
          setBulkResult(summary);
          if (summary.failed === 0) {
            toast.success(`Generated timetables for all ${summary.total} classes`);
          } else {
            toast.warning(
              `${summary.succeeded} / ${summary.total} classes generated. ${summary.failed} failed.`,
            );
          }
        } catch (err: any) {
          toast.error(err?.data?.error ?? err?.data?.message ?? 'Bulk generation failed');
        }
      }
    },
    [wizardMode, classId, sectionId, autoGenerateTimetable, bulkGenerateTimetables],
  );

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleExportPdf = useCallback(async () => {
    const el = document.getElementById('timetable-print-area');
    if (!el) {
      toast.error('No timetable to export. Please load a timetable first.');
      return;
    }
    const toastId = 'pdf-export';
    toast.loading('Generating PDF…', { id: toastId });
    try {
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      await pdf.html(el, {
        callback: (doc) => {
          doc.save(classId ? `timetable-${classId}.pdf` : 'timetable.pdf');
        },
        x: 5,
        y: 5,
        width: 285,
        windowWidth: el.scrollWidth,
      });
      toast.success('PDF saved', { id: toastId });
    } catch {
      toast.error('PDF export failed', { id: toastId });
    }
  }, [classId]);

  // ── Render ────────────────────────────────────────────────────────────────

  const isLoading = timetableLoading || timetableFetching;

  return (
    <div className="h-full w-full p-4 md:p-6 space-y-5 print:p-0 print:space-y-2">
      {/* Auto-generate wizard modal (used for both single-class and bulk) */}
      <AutoGenerateWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onConfirm={handleWizardConfirm}
        mode={wizardMode}
      />

      {/* Page header */}
      <TimetableHeader
        view={view}
        onViewChange={setView}
        classId={classId}
        sectionId={sectionId}
        onClassChange={setClassId}
        onSectionChange={setSectionId}
        onAutoGenerate={handleAutoGenerate}
        onBulkGenerate={handleBulkGenerate}
        onPrint={handlePrint}
        onExportPdf={handleExportPdf}
        isAutoGenerating={isAutoGenerating}
        isBulkGenerating={isBulkGenerating}
      />

      {/* Bulk result banner */}
      {bulkResult && (
        <BulkResultBanner result={bulkResult} onDismiss={() => setBulkResult(null)} />
      )}

      {/* ── Class View ── */}
      {view === 'class' && (
        <>
          {classId && timetableList.length > 0 && !isLoading && (
            <DayCoverage timetableList={timetableList} />
          )}

          {!classId ? (
            <EmptyNoClass />
          ) : isLoading ? (
            <TimetableGrid timetableList={[]} isLoading />
          ) : timetableList.length === 0 ? (
            <EmptyNoTimetable
              onAutoGenerate={handleAutoGenerate}
              isLoading={isAutoGenerating}
            />
          ) : (
            <TimetableGrid timetableList={timetableList} />
          )}
        </>
      )}

      {/* ── Teacher View ── */}
      {view === 'teacher' && (
        <TeacherScheduleView
          teacherId={teacherId}
          onTeacherChange={setTeacherId}
        />
      )}
    </div>
  );
}
