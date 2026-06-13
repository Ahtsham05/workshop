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

/** Match server resolveDayStatus — default unmarked days are Present. */
export function resolveDayStatus(attendance: AttendanceLike, leave: LeaveLike): string {
  const attendanceStatus = attendance?.status;

  if (attendanceStatus === 'Holiday') return 'Holiday';

  if (leave?.status === 'Approved') {
    return leave.isHalfDay ? 'Half-Day' : 'On Leave';
  }

  if (attendanceStatus === 'Absent') {
    if ((attendance as { checkIn?: string | Date | null })?.checkIn) return 'Present';
    return 'Absent';
  }
  if (attendanceStatus === 'On Leave') return 'On Leave';

  if (leave?.status === 'Pending') {
    return leave.isHalfDay ? 'Half-Day' : 'Absent';
  }

  if (attendanceStatus === 'Half-Day') return 'Half-Day';
  if (attendanceStatus === 'Late') return 'Late';
  if (attendanceStatus === 'Present') return 'Present';

  return 'Present';
}
