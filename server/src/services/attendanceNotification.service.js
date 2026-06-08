const { Student, Notification } = require('../models');
const pushNotificationService = require('./pushNotification.service');
const logger = require('../config/logger');

const formatTime = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const formatDate = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'today';
  return d.toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
};

const buildMessage = (record, studentName) => {
  const dateLabel = formatDate(record.date);
  const timeLabel = record.checkInTime ? formatTime(record.checkInTime) : null;

  switch (record.status) {
    case 'present':
      return {
        title: 'Marked Present',
        message: timeLabel
          ? `${studentName} arrived at school at ${timeLabel} on ${dateLabel}.`
          : `${studentName} has been marked present on ${dateLabel}.`,
      };
    case 'late':
      return {
        title: 'Marked Late',
        message: timeLabel
          ? `${studentName} arrived late at ${timeLabel} on ${dateLabel}.`
          : `${studentName} has been marked late on ${dateLabel}.`,
      };
    case 'absent':
      return {
        title: 'Marked Absent',
        message: `${studentName} has been marked absent on ${dateLabel}.`,
      };
    case 'leave':
      return {
        title: 'On Leave',
        message: `${studentName} is on leave on ${dateLabel}.`,
      };
    case 'half_day':
      return {
        title: 'Half Day',
        message: `${studentName} has been marked half day on ${dateLabel}.`,
      };
    default:
      return {
        title: 'Attendance Updated',
        message: `${studentName}'s attendance on ${dateLabel}: ${record.status}.`,
      };
  }
};

/**
 * After attendance is saved, notify each student's portal account (in-app + web push).
 */
const notifyAttendanceRecords = async (records, context) => {
  if (!Array.isArray(records) || !records.length) return { notified: 0 };

  const studentIds = [...new Set(records.map((r) => String(r.studentId)))];
  const students = await Student.find({ _id: { $in: studentIds } })
    .select('firstName lastName parentUserId')
    .lean();

  const studentMap = new Map(students.map((s) => [String(s._id), s]));
  let notified = 0;

  for (const record of records) {
    const student = studentMap.get(String(record.studentId));
    if (!student?.parentUserId) continue;

    const studentName = `${student.firstName} ${student.lastName || ''}`.trim();
    const { title, message } = buildMessage(record, studentName);
    const userId = student.parentUserId;

    try {
      await Notification.create({
        organizationId: context.organizationId,
        branchId: context.branchId,
        title,
        message,
        audience: ['student', 'parent'],
        type: 'attendance',
        recipientUserId: userId,
        createdBy: context.createdBy,
      });

      await pushNotificationService.sendToUser(userId, {
        title,
        body: message,
        tag: `attendance-${record.studentId}-${record.date}`,
        url: '/school/portals/student',
      });

      notified += 1;
    } catch (err) {
      logger.warn(`Attendance notification failed for student ${record.studentId}: ${err.message}`);
    }
  }

  return { notified };
};

module.exports = { notifyAttendanceRecords };
