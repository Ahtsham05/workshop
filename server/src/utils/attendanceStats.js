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
 * Approved leave overrides Present/Late (e.g. bulk save or check-in on a leave day).
 */
const resolveDayStatus = (attendance, leave) => {
  const attendanceStatus = attendance?.status;

  if (attendanceStatus === 'Holiday') return 'Holiday';
  if (attendanceStatus === 'Absent') return 'Absent';
  if (attendanceStatus === 'On Leave') return 'On Leave';

  if (leave?.status === 'Approved') {
    return leave.isHalfDay ? 'Half-Day' : 'On Leave';
  }

  // Unapproved leave is treated as absent for attendance and payroll.
  if (leave?.status === 'Pending') {
    return leave.isHalfDay ? 'Half-Day' : 'Absent';
  }

  // Rejected leave — days are not paid; count as absent for payroll.
  if (leave?.status === 'Rejected') {
    return leave.isHalfDay ? 'Half-Day' : 'Absent';
  }

  if (attendanceStatus === 'Half-Day') return 'Half-Day';
  if (attendanceStatus === 'On Leave') return 'On Leave';
  if (attendanceStatus === 'Late') return 'Late';
  if (attendanceStatus === 'Present') return 'Present';

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
    const dayValue = leave?.isHalfDay && status === 'Half-Day' ? 0.5 : 1;

    switch (status) {
      case 'Holiday':
        holidayDays += 1;
        break;
      case 'Absent':
        absentDays += 1;
        if (leave?.status === 'Pending') pendingLeaveDays += 1;
        break;
      case 'Half-Day':
        halfDays += 1;
        if (leave?.status === 'Pending') {
          absentDays += leave.isHalfDay ? 0.5 : 1;
          pendingLeaveDays += leave.isHalfDay ? 0.5 : 1;
        } else if (leave) {
          leaveDays += 0.5;
          if (leave.leaveType && UNPAID_LEAVE_TYPES.includes(leave.leaveType)) {
            unpaidLeaveDays += 0.5;
          } else if (leave.leaveType) {
            paidLeaveDays += 0.5;
          }
        } else {
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

  const presentDays = Math.max(0, workingDays - absentDays - leaveDays - holidayDays);

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
