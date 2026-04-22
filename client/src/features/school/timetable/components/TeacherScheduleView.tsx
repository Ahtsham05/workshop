import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGetTeachersQuery, useGetTimetableByTeacherQuery } from '@/stores/school.api';
import { User, CalendarDays } from 'lucide-react';

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

interface SlotDef {
  periodNo: number;
  startTime: string;
  endTime: string;
}

function buildTeacherGrid(rawData: any) {
  /** Server may return:
   *  - Array of { day, periods[] }  (same shape as class timetable)
   *  - Object  { monday: [...], tuesday: [...] }
   *  - Nested { schedule: [...] }
   * Handle all shapes defensively.
   */
  let list: any[] = [];

  if (Array.isArray(rawData)) {
    list = rawData;
  } else if (rawData && typeof rawData === 'object') {
    if (Array.isArray(rawData.schedule)) {
      list = rawData.schedule;
    } else {
      // object keyed by day name
      for (const day of DAYS) {
        if (Array.isArray(rawData[day])) {
          list.push({ day, periods: rawData[day] });
        }
      }
    }
  }

  const slotMap = new Map<number, SlotDef>();
  const matrix: Partial<Record<Day, Record<number, any>>> = {};

  for (const entry of list) {
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
      matrix[day]![period.periodNo] = period;
    }
  }

  const slots = Array.from(slotMap.values()).sort((a, b) => a.periodNo - b.periodNo);
  const activeDays = DAYS.filter((d) => matrix[d] && Object.keys(matrix[d]!).length > 0);

  return { slots, matrix, activeDays };
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function TeacherGridSkeleton() {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-border shadow-sm animate-pulse">
      <div className="h-10 bg-muted/40 border-b border-border/40" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-20 border-b border-border/25 last:border-b-0 bg-muted/10" />
      ))}
    </div>
  );
}

// ─── Teacher period cell ──────────────────────────────────────────────────────

function TeacherPeriodCell({ period }: { period: any }) {
  if (!period) {
    return (
      <div className="h-[76px] rounded-lg border-2 border-dashed border-border/40 bg-muted/15 flex items-center justify-center">
        <span className="text-[11px] text-muted-foreground/30 select-none">—</span>
      </div>
    );
  }
  return (
    <div className="h-[76px] rounded-lg border border-violet-200 bg-violet-50 p-2 flex flex-col justify-between">
      <span className="text-[11px] font-semibold text-violet-900 line-clamp-2 leading-tight">
        {period.subjectId?.name ?? 'Subject TBD'}
      </span>
      {(period.classId || period.sectionId) && (
        <span className="text-[10px] text-violet-700 truncate">
          {period.classId?.name ?? ''}
          {period.sectionId?.name ? ` · ${period.sectionId.name}` : ''}
        </span>
      )}
      {period.room && (
        <span className="text-[10px] text-violet-500/70 truncate">Rm {period.room}</span>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface TeacherScheduleViewProps {
  teacherId: string;
  onTeacherChange: (id: string) => void;
}

/**
 * Teacher Schedule View.
 *
 * Shows a teacher's full weekly load across all classes in the same
 * Days × Periods grid layout as the Class View.
 *
 * Each cell shows:
 * - Subject name
 * - Class name  (e.g. "Grade 5 · Section A")
 * - Room number
 */
export function TeacherScheduleView({ teacherId, onTeacherChange }: TeacherScheduleViewProps) {
  const { data: teachersData } = useGetTeachersQuery({ limit: 200 });
  const { data: rawSchedule, isLoading } = useGetTimetableByTeacherQuery(teacherId, {
    skip: !teacherId,
  });

  const { slots, matrix, activeDays } = useMemo(
    () => buildTeacherGrid(rawSchedule),
    [rawSchedule],
  );

  const displayDays = activeDays.length > 0 ? activeDays : DAYS.slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Teacher picker */}
      <div className="flex items-center gap-3 print:hidden">
        <User className="h-4 w-4 text-muted-foreground shrink-0" />
        <Select value={teacherId} onValueChange={onTeacherChange}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Select Teacher" />
          </SelectTrigger>
          <SelectContent>
            {(teachersData?.results ?? []).map((t: any) => (
              <SelectItem key={t.id ?? t._id} value={t.id ?? t._id}>
                {t.firstName} {t.lastName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Body states */}
      {!teacherId ? (
        <div className="py-20 flex flex-col items-center justify-center text-center text-muted-foreground">
          <User className="h-14 w-14 mb-4 opacity-15" />
          <p className="font-medium">Select a teacher to view their weekly schedule</p>
          <p className="text-sm mt-1 opacity-70">
            Shows all classes and subjects assigned to the teacher
          </p>
        </div>
      ) : isLoading ? (
        <TeacherGridSkeleton />
      ) : slots.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-center text-muted-foreground">
          <CalendarDays className="h-14 w-14 mb-4 opacity-15" />
          <p className="font-medium">No timetable assigned to this teacher</p>
        </div>
      ) : (
        <div
          id="timetable-print-area"
          className="w-full overflow-x-auto rounded-xl border border-border shadow-sm print:overflow-visible print:shadow-none"
        >
          <table
            className="w-full border-collapse"
            style={{ minWidth: `${displayDays.length * 140 + 112}px` }}
          >
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
            <tbody>
              {slots.map((slot, rowIdx) => (
                <tr
                  key={slot.periodNo}
                  className={cn(
                    'border-b border-border/25 last:border-b-0',
                    rowIdx % 2 === 0 ? 'bg-background' : 'bg-muted/10',
                  )}
                >
                  {/* Time column */}
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
                  {displayDays.map((day) => (
                    <td key={day} className="px-2 py-2">
                      <TeacherPeriodCell period={matrix[day]?.[slot.periodNo] ?? null} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
