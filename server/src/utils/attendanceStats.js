const normalizeDateOnly = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const eachDateInRange = (startDate, endDate) => {
  const dates = [];
  const cursor = normalizeDateOnly(startDate);
  const end = normalizeDateOnly(endDate);
  while (cursor <= end) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const UNPAID_LEAVE_TYPES = ['Unpaid'];

/**
 * Resolve the effective status for a day.
 *
 * Approved leave is a finished decision, so it overrides everything else (including a
 * stray check-in). A leave that's still Pending is *not* a decision yet — it must never
 * read as Absent, and any real attendance signal for the day (a check-in, or an explicit
 * status an admin actually chose) always takes priority over an undecided request. Only
 * when there's no real attendance signal at all do we fall back to the leave's state.
 */
const resolveDayStatus = (attendance, leave) => {
  const attendanceStatus = attendance?.status;

  if (attendanceStatus === 'Holiday') return 'Holiday';

  // Approved leave overrides attendance (including check-in / present days).
  if (leave?.status === 'Approved') {
    return leave.isHalfDay ? 'Half-Day' : 'On Leave';
  }

  // A real check-in means the employee actually showed up — that fact beats any
  // leave application (pending or otherwise) and any stale "Absent" marking.
  if (attendance?.checkIn) return attendanceStatus === 'Late' ? 'Late' : 'Present';

  if (attendanceStatus === 'Present') return 'Present';
  if (attendanceStatus === 'Late') return 'Late';
  if (attendanceStatus === 'Half-Day') return 'Half-Day';
  if (attendanceStatus === 'On Leave') return 'On Leave';
  // Explicit Absent (no check-in, no leave override above) is a deliberate admin call.
  if (attendanceStatus === 'Absent') return 'Absent';

  // No explicit attendance action was taken for the day — fall back to the leave request.
  if (leave?.status === 'Pending') return 'Leave Pending';

  // Rejected leave — the employee didn't show up and the request was denied; count as absent for payroll.
  if (leave?.status === 'Rejected') {
    return leave.isHalfDay ? 'Half-Day' : 'Absent';
  }

  return 'Present';
};

/**
 * Compute attendance stats with default-present logic:
 * days without an explicit absent/leave/holiday record count as present.
 */
const computeAttendanceStatsFromData = ({
  periodStart,
  periodEnd,
  joiningDate = null,
  lastWorkingDate = null,
  attendances = [],
  leaves = [],
}) => {
  let effectiveStart = normalizeDateOnly(periodStart);
  let effectiveEnd = normalizeDateOnly(periodEnd);
  const today = normalizeDateOnly(new Date());
  if (effectiveEnd > today) {
    effectiveEnd = today;
  }

  if (joiningDate) {
    const joining = normalizeDateOnly(joiningDate);
    if (joining > effectiveStart) effectiveStart = joining;
  }

  // Attendance/payroll stop counting after an employee's last working day —
  // a terminated/resigned employee should never accrue absences past exit.
  if (lastWorkingDate) {
    const exitDate = normalizeDateOnly(lastWorkingDate);
    if (exitDate < effectiveEnd) effectiveEnd = exitDate;
  }

  if (effectiveStart > effectiveEnd) {
    return {
      workingDays: 0,
      presentDays: 0,
      absentDays: 0,
      leaveDays: 0,
      pendingLeaveDays: 0,
      unpaidLeaveDays: 0,
      paidLeaveDays: 0,
      lateDays: 0,
      halfDays: 0,
      holidayDays: 0,
      overtimeHours: 0,
    };
  }

  const dates = eachDateInRange(effectiveStart, effectiveEnd);
  const workingDays = dates.length;

  const attendanceMap = new Map();
  attendances.forEach((record) => {
    attendanceMap.set(normalizeDateOnly(record.date).getTime(), record);
  });

  const leaveOnDate = new Map();
  leaves
    .filter((leave) => ['Approved', 'Pending', 'Rejected'].includes(leave.status))
    .forEach((leave) => {
      const overlapStart = normalizeDateOnly(leave.startDate) > effectiveStart
        ? normalizeDateOnly(leave.startDate)
        : effectiveStart;
      const overlapEnd = normalizeDateOnly(leave.endDate) < effectiveEnd
        ? normalizeDateOnly(leave.endDate)
        : effectiveEnd;
      eachDateInRange(overlapStart, overlapEnd).forEach((date) => {
        leaveOnDate.set(date.getTime(), leave);
      });
    });

  let absentDays = 0;
  let leaveDays = 0;
  let pendingLeaveDays = 0;
  let unpaidLeaveDays = 0;
  let paidLeaveDays = 0;
  let lateDays = 0;
  let halfDays = 0;
  let holidayDays = 0;
  const overtimeHours = attendances.reduce((sum, record) => sum + Number(record.overtime || 0), 0);

  dates.forEach((date) => {
    const timestamp = date.getTime();
    const record = attendanceMap.get(timestamp);
    const leave = leaveOnDate.get(timestamp);
    const status = resolveDayStatus(record, leave);
    const dayValue = leave?.isHalfDay ? 0.5 : 1;

    switch (status) {
      case 'Holiday':
        holidayDays += 1;
        break;
      case 'Absent':
        absentDays += 1;
        break;
      case 'Leave Pending':
        // Not decided yet — tracked separately, never counted as absent or deducted from pay.
        pendingLeaveDays += dayValue;
        break;
      case 'Half-Day':
        halfDays += 1;
        if (leave?.status === 'Approved') {
          leaveDays += 0.5;
          if (leave.leaveType && UNPAID_LEAVE_TYPES.includes(leave.leaveType)) {
            unpaidLeaveDays += 0.5;
          } else if (leave.leaveType) {
            paidLeaveDays += 0.5;
          }
        } else {
          // Explicit manual half-day with no approved leave behind it.
          absentDays += 0.5;
        }
        break;
      case 'On Leave':
        leaveDays += dayValue;
        if (leave?.leaveType && UNPAID_LEAVE_TYPES.includes(leave.leaveType)) {
          unpaidLeaveDays += dayValue;
        } else if (leave?.leaveType) {
          paidLeaveDays += dayValue;
        }
        break;
      case 'Late':
        lateDays += 1;
        break;
      default:
        break;
    }
  });

  const presentDays = Math.max(
    0,
    workingDays - absentDays - leaveDays - holidayDays - pendingLeaveDays,
  );

  return {
    workingDays,
    presentDays,
    absentDays,
    leaveDays,
    pendingLeaveDays,
    unpaidLeaveDays,
    paidLeaveDays,
    lateDays,
    halfDays,
    holidayDays,
    overtimeHours,
  };
};

module.exports = {
  normalizeDateOnly,
  eachDateInRange,
  UNPAID_LEAVE_TYPES,
  resolveDayStatus,
  computeAttendanceStatsFromData,
};
