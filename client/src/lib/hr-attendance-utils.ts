/** Parse API date values to YYYY-MM-DD without timezone drift. */
export function toLocalDateKey(value: string | Date): string {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const d = value instanceof Date ? value : new Date(value);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type LeaveLike = {
  status?: string;
  isHalfDay?: boolean;
  leaveType?: string;
} | null | undefined;

export type AttendanceLike = {
  status?: string;
  checkIn?: string | Date | null;
} | null | undefined;

/**
 * Match server resolveDayStatus — default unmarked days are Present.
 *
 * Approved leave is a finished decision and overrides everything else. A Pending leave is
 * not a decision yet, so it must never read as Absent — any real attendance signal (a
 * check-in, or an explicit status someone actually chose) always wins over an undecided
 * request. Only when there's no real attendance signal at all do we fall back to the
 * leave's own state.
 */
export function resolveDayStatus(attendance: AttendanceLike, leave: LeaveLike): string {
  const attendanceStatus = attendance?.status;

  if (attendanceStatus === 'Holiday') return 'Holiday';

  if (leave?.status === 'Approved') {
    return leave.isHalfDay ? 'Half-Day' : 'On Leave';
  }

  if ((attendance as { checkIn?: string | Date | null })?.checkIn) {
    return attendanceStatus === 'Late' ? 'Late' : 'Present';
  }

  if (attendanceStatus === 'Present') return 'Present';
  if (attendanceStatus === 'Late') return 'Late';
  if (attendanceStatus === 'Half-Day') return 'Half-Day';
  if (attendanceStatus === 'On Leave') return 'On Leave';
  if (attendanceStatus === 'Absent') return 'Absent';

  if (leave?.status === 'Pending') return 'Leave Pending';

  if (leave?.status === 'Rejected') {
    return leave.isHalfDay ? 'Half-Day' : 'Absent';
  }

  return 'Present';
}
