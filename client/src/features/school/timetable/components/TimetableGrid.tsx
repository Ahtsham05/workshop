import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { TimetableCell, type SubjectColor, type TimetablePeriod } from './TimetableCell';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
type Day = (typeof DAYS)[number];

const DAY_LABELS: Record<Day, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
};

/**
 * 12-color pastel palette – one per subject.
 * Order is stable: first unique subject ID seen in timetableList gets index 0.
 */
const SUBJECT_PALETTE: SubjectColor[] = [
  { bg: 'bg-blue-100',    text: 'text-blue-800',    border: 'border-blue-200'    },
  { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200' },
  { bg: 'bg-violet-100',  text: 'text-violet-800',  border: 'border-violet-200'  },
  { bg: 'bg-amber-100',   text: 'text-amber-800',   border: 'border-amber-200'   },
  { bg: 'bg-rose-100',    text: 'text-rose-800',    border: 'border-rose-200'    },
  { bg: 'bg-cyan-100',    text: 'text-cyan-800',    border: 'border-cyan-200'    },
  { bg: 'bg-orange-100',  text: 'text-orange-800',  border: 'border-orange-200'  },
  { bg: 'bg-pink-100',    text: 'text-pink-800',    border: 'border-pink-200'    },
  { bg: 'bg-lime-100',    text: 'text-lime-800',    border: 'border-lime-200'    },
  { bg: 'bg-indigo-100',  text: 'text-indigo-800',  border: 'border-indigo-200'  },
  { bg: 'bg-teal-100',    text: 'text-teal-800',    border: 'border-teal-200'    },
  { bg: 'bg-fuchsia-100', text: 'text-fuchsia-800', border: 'border-fuchsia-200' },
];

// ─── Type helpers ─────────────────────────────────────────────────────────────

interface SlotDef {
  periodNo: number;
  startTime: string;
  endTime: string;
}

interface GridData {
  slots: SlotDef[];
  /** matrix[day][periodNo] = period | undefined */
  matrix: Partial<Record<Day, Record<number, TimetablePeriod>>>;
  colorMap: Record<string, SubjectColor>;
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

function subjectId(period: any): string | undefined {
  return period?.subjectId?._id ?? period?.subjectId?.id;
}

/** Builds colour mapping: subjectId → palette entry, stable across renders. */
function buildColorMap(timetableList: any[]): Record<string, SubjectColor> {
  const seen = new Map<string, number>();
  let counter = 0;
  for (const entry of timetableList) {
    for (const period of entry.periods ?? []) {
      const id = subjectId(period);
      if (id && !seen.has(id)) {
        seen.set(id, counter % SUBJECT_PALETTE.length);
        counter++;
      }
    }
  }
  const result: Record<string, SubjectColor> = {};
  for (const [id, idx] of seen.entries()) {
    result[id] = SUBJECT_PALETTE[idx];
  }
  return result;
}

/**
 * Transforms the flat timetable array (one entry per day) into a
 * `{ slots[], matrix{day → {periodNo → period}} }` structure used by the grid.
 */
function buildGridData(timetableList: any[]): GridData {
  const slotMap = new Map<number, SlotDef>();
  const matrix: Partial<Record<Day, Record<number, TimetablePeriod>>> = {};

  for (const entry of timetableList) {
    const day = entry.day as Day;
    if (!matrix[day]) matrix[day] = {};

    for (const period of entry.periods ?? []) {
      if (!slotMap.has(period.periodNo)) {
        slotMap.set(period.periodNo, {
          periodNo: period.periodNo,
          startTime: period.startTime ?? '',
          endTime: period.endTime ?? '',
        });
      }
      matrix[day]![period.periodNo] = period as TimetablePeriod;
    }
  }

  return {
    slots: Array.from(slotMap.values()).sort((a, b) => a.periodNo - b.periodNo),
    matrix,
    colorMap: buildColorMap(timetableList),
  };
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function GridSkeleton({ rows = 7, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-border shadow-sm animate-pulse">
      {/* header row */}
      <div className="grid border-b border-border/40 bg-muted/40" style={{ gridTemplateColumns: `7rem repeat(${cols}, 1fr)` }}>
        <div className="h-10 m-2 rounded bg-muted/60" />
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-10 m-2 rounded bg-muted/60" />
        ))}
      </div>
      {/* body rows */}
      {Array.from({ length: rows }).map((_, row) => (
        <div
          key={row}
          className="grid border-b border-border/30 last:border-b-0"
          style={{ gridTemplateColumns: `7rem repeat(${cols}, 1fr)` }}
        >
          <div className="h-[76px] m-2 rounded bg-muted/40" />
          {Array.from({ length: cols }).map((_, col) => (
            <div key={col} className="h-[76px] m-2 rounded bg-muted/30" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Subject legend ───────────────────────────────────────────────────────────

function SubjectLegend({ colorMap, timetableList }: { colorMap: Record<string, SubjectColor>; timetableList: any[] }) {
  const subjects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const entry of timetableList) {
      for (const p of entry.periods ?? []) {
        const id = subjectId(p);
        if (id && !seen.has(id) && p.subjectId?.name) {
          seen.set(id, p.subjectId.name);
        }
      }
    }
    return Array.from(seen.entries());
  }, [timetableList]);

  if (subjects.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap print:hidden">
      <span className="text-xs text-muted-foreground font-medium">Legend:</span>
      {subjects.map(([id, name]) => {
        const color = colorMap[id];
        if (!color) return null;
        return (
          <span
            key={id}
            className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border', color.bg, color.text, color.border)}
          >
            {name}
          </span>
        );
      })}
    </div>
  );
}

// ─── Main Grid Component ──────────────────────────────────────────────────────

interface TimetableGridProps {
  timetableList: any[];
  isLoading?: boolean;
  /** className for the outer wrapper */
  className?: string;
}

/**
 * Days × Periods grid with:
 * - Sticky time-slot column
 * - Color-coded subjects
 * - Conflict highlighting
 * - Drag-and-drop ready data attributes (future DnD integration)
 * - Print-safe layout
 */
export function TimetableGrid({ timetableList, isLoading, className }: TimetableGridProps) {
  const { slots, matrix, colorMap } = useMemo(() => buildGridData(timetableList), [timetableList]);

  if (isLoading) return <GridSkeleton />;

  if (slots.length === 0) return null;

  // Only show days that have at least one period configured
  const activeDays = DAYS.filter((d) => matrix[d] && Object.keys(matrix[d]!).length > 0);
  const displayDays = activeDays.length > 0 ? activeDays : DAYS.slice(0, 5);

  return (
    <div className={cn('space-y-3', className)}>
      <SubjectLegend colorMap={colorMap} timetableList={timetableList} />

      {/* Grid Table */}
      <div id="timetable-print-area" className="w-full overflow-x-auto rounded-xl border border-border shadow-sm print:overflow-visible print:shadow-none">
        <table className="w-full border-collapse" style={{ minWidth: `${displayDays.length * 130 + 112}px` }}>
          {/* ── Header ── */}
          <thead>
            <tr className="bg-muted/50">
              <th className="w-28 px-3 py-3 text-left sticky left-0 z-10 bg-muted/50 text-[11px] font-semibold text-muted-foreground border-b border-r border-border/50 select-none">
                Period / Time
              </th>
              {displayDays.map((day) => (
                <th
                  key={day}
                  className="px-3 py-3 text-center text-[11px] font-semibold text-foreground border-b border-border/50 select-none"
                >
                  {DAY_LABELS[day]}
                </th>
              ))}
            </tr>
          </thead>

          {/* ── Body ── */}
          <tbody>
            {slots.map((slot, rowIdx) => (
              <tr
                key={slot.periodNo}
                className={cn(
                  'border-b border-border/25 last:border-b-0',
                  rowIdx % 2 === 0 ? 'bg-background' : 'bg-muted/10',
                )}
              >
                {/* Time column – sticky */}
                <td className="px-3 py-2 border-r border-border/30 w-28 sticky left-0 z-10 bg-inherit">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-foreground">P{slot.periodNo}</span>
                    {slot.startTime && (
                      <span className="text-[10px] text-muted-foreground leading-tight">
                        {slot.startTime}
                        {slot.endTime ? ` – ${slot.endTime}` : ''}
                      </span>
                    )}
                  </div>
                </td>

                {/* Day cells */}
                {displayDays.map((day) => {
                  const period = matrix[day]?.[slot.periodNo] ?? null;
                  const sid = period ? subjectId(period) : undefined;
                  return (
                    <td key={day} className="px-2 py-2">
                      <TimetableCell
                        period={period}
                        subjectColor={sid ? colorMap[sid] : undefined}
                        data-day={day}
                        data-period={slot.periodNo}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
