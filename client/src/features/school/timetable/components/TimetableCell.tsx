import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SubjectColor {
  bg: string;
  text: string;
  border: string;
}

export interface TimetablePeriod {
  periodNo: number;
  startTime?: string;
  endTime?: string;
  type: string;
  subjectId?: { _id?: string; id?: string; name: string } | null;
  teacherId?: { _id?: string; id?: string; firstName: string; lastName: string } | null;
  room?: string;
  /** Set by conflict-check logic before rendering */
  _conflict?: boolean;
  _conflictMsg?: string;
}

interface TimetableCellProps {
  period: TimetablePeriod | null;
  subjectColor?: SubjectColor;
  /** Future drag-and-drop anchor; coordinates stored as data-* attributes */
  'data-day'?: string;
  'data-period'?: number;
  className?: string;
}

const BREAK_TYPES = new Set(['break', 'lunch', 'assembly', 'sports', 'other']);

/**
 * A single cell in the timetable grid.
 *
 * - `null` period → empty dashed placeholder (drag-target ready)
 * - break/lunch/assembly → amber badge cell
 * - class period → color-coded card with subject + teacher name
 * - conflict → red ring + tooltip
 *
 * Data attributes are forwarded to the root element so a future
 * DnD library (e.g. react-beautiful-dnd) can read cell coordinates.
 */
export function TimetableCell({ period, subjectColor, className, ...dragProps }: TimetableCellProps) {
  if (!period) {
    return (
      <div
        className={cn(
          'h-[76px] rounded-lg border-2 border-dashed border-border/40',
          'bg-muted/15 flex items-center justify-center',
          'transition-colors hover:border-border/60 hover:bg-muted/25',
          className,
        )}
        {...dragProps}
      >
        <span className="text-[11px] text-muted-foreground/30 select-none">—</span>
      </div>
    );
  }

  const isBreak = BREAK_TYPES.has(period.type);

  if (isBreak) {
    return (
      <div
        className={cn(
          'h-[76px] rounded-lg border border-amber-200 bg-amber-50/70',
          'flex items-center justify-center',
          className,
        )}
        {...dragProps}
      >
        <span className="text-xs font-medium text-amber-700 capitalize select-none">
          {period.type}
        </span>
      </div>
    );
  }

  const hasConflict = Boolean(period._conflict);

  const cellContent = (
    <div
      className={cn(
        'h-[76px] rounded-lg border p-2 flex flex-col justify-between',
        'cursor-pointer transition-all select-none',
        'hover:shadow-md hover:scale-[1.02]',
        hasConflict
          ? 'border-red-300 bg-red-50 ring-2 ring-red-200'
          : subjectColor
            ? cn(subjectColor.bg, subjectColor.border, 'border')
            : 'bg-card border-border/60',
        className,
      )}
      {...dragProps}
    >
      {/* Subject row */}
      <div className="flex items-start justify-between gap-1">
        <span
          className={cn(
            'text-[11px] font-semibold leading-tight line-clamp-2 flex-1',
            hasConflict ? 'text-red-700' : subjectColor?.text ?? 'text-foreground',
          )}
        >
          {period.subjectId?.name ?? 'Subject TBD'}
        </span>
        {hasConflict && (
          <AlertTriangle className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />
        )}
      </div>

      {/* Teacher row */}
      {period.teacherId && (
        <p
          className={cn(
            'text-[10px] truncate leading-tight',
            hasConflict ? 'text-red-500' : subjectColor?.text ?? 'text-muted-foreground',
            'opacity-75',
          )}
        >
          {period.teacherId.firstName} {period.teacherId.lastName}
        </p>
      )}

      {/* Room row */}
      {period.room && (
        <p className="text-[10px] text-muted-foreground/50 truncate">
          Rm {period.room}
        </p>
      )}
    </div>
  );

  if (hasConflict) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{cellContent}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[220px] text-xs bg-red-950 text-red-100 border-red-800"
        >
          {period._conflictMsg ?? 'Scheduling conflict detected'}
        </TooltipContent>
      </Tooltip>
    );
  }

  return cellContent;
}
