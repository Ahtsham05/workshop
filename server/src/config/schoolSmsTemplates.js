/**
 * Ready-made SMS templates for schools.
 *
 * Written for SMS, not WhatsApp: every one is kept inside a single 160-character GSM-7
 * segment once its placeholders expand, because a school texting 400 parents pays per
 * segment. Anything that would spill into a second segment is a deliberate choice, not an
 * accident — and the composer shows the real cost either way.
 *
 * Plain ASCII only. A single curly quote, dash or Urdu word flips the whole message to
 * UCS-2 and drops the limit from 160 characters to 70, roughly doubling the bill.
 *
 * `context` decides where a template may be used, because the two send paths resolve
 * different placeholders:
 *   'broadcast' — student placeholders ({name}, {class}, {section}, {admissionNo},
 *                 {fatherName}, {school}); used by Broadcast and Bulk Custom.
 *   'fee_alert' — the above plus the voucher placeholders ({amount}, {month}, {year},
 *                 {feeType}, {status}); Fee Alerts only.
 */

// Used to render the preview a user sees before picking a template, and to size its
// segment cost against realistic (not empty) values.
const SAMPLE_CONTEXT = {
  name: 'Ayesha Khan',
  class: 'Five',
  section: 'A',
  admissionNo: 'ADM-1042',
  fatherName: 'Mr. Imran Khan',
  school: 'Islamic Scientific School',
  amount: '4,500',
  month: 'September',
  year: '2026',
  feeType: 'Tuition',
  status: 'overdue',
};

const TEMPLATES = [
  // ── Fees ────────────────────────────────────────────────────────────────────
  {
    id: 'fee_due_reminder',
    title: 'Fee due reminder',
    category: 'Fees',
    context: 'fee_alert',
    body: 'Dear Parent, {feeType} fee of Rs {amount} for {name} ({month} {year}) is {status}. Kindly clear the dues at your earliest. - {school}',
  },
  {
    id: 'fee_final_notice',
    title: 'Fee final notice',
    category: 'Fees',
    context: 'fee_alert',
    body: 'Dear Parent, final reminder: {feeType} fee Rs {amount} for {name} ({month} {year}) is unpaid. Kindly pay now to avoid late charges. - {school}',
  },
  {
    id: 'fee_due_date',
    title: 'Fee due date announcement',
    category: 'Fees',
    context: 'broadcast',
    body: 'Dear Parent, monthly fee for {name} ({class}) is due by the 10th. Please pay at the school office to avoid a late fee. - {school}',
  },
  {
    id: 'fee_received',
    title: 'Fee received - thank you',
    category: 'Fees',
    context: 'broadcast',
    body: 'Dear Parent, we have received the fee for {name} ({class}). Thank you for your prompt payment. - {school}',
  },

  // ── Attendance ──────────────────────────────────────────────────────────────
  {
    id: 'absent_today',
    title: 'Absent today',
    category: 'Attendance',
    context: 'broadcast',
    body: 'Dear Parent, {name} ({class}-{section}) was marked absent today. Please inform the school of the reason. - {school}',
  },
  {
    id: 'late_arrival',
    title: 'Late arrival',
    category: 'Attendance',
    context: 'broadcast',
    body: 'Dear Parent, {name} ({class}) reached school late today. Please ensure timely arrival. - {school}',
  },
  {
    id: 'low_attendance',
    title: 'Low attendance warning',
    category: 'Attendance',
    context: 'broadcast',
    body: 'Dear Parent, attendance of {name} ({class}) has fallen below the required level. Regular attendance is necessary. - {school}',
  },

  // ── Exams & Results ─────────────────────────────────────────────────────────
  {
    id: 'exam_schedule',
    title: 'Exam schedule announced',
    category: 'Exams',
    context: 'broadcast',
    body: 'Dear Parent, exams for {class} begin soon. The datesheet has been sent with {name}. Please help them prepare. - {school}',
  },
  {
    id: 'result_ready',
    title: 'Result ready for collection',
    category: 'Exams',
    context: 'broadcast',
    body: 'Dear Parent, the result of {name} ({class}) is ready. Please collect the report card from school. - {school}',
  },
  {
    id: 'ptm_invite',
    title: 'Parent-teacher meeting',
    category: 'Exams',
    context: 'broadcast',
    body: 'Dear Parent of {name} ({class}), a parent-teacher meeting is scheduled this Saturday at 10:00 AM. Your presence is requested. - {school}',
  },

  // ── Announcements ───────────────────────────────────────────────────────────
  {
    id: 'holiday_notice',
    title: 'Holiday notice',
    category: 'Announcements',
    context: 'broadcast',
    body: 'Dear Parent, the school will remain closed tomorrow on account of a public holiday. Classes resume the next working day. - {school}',
  },
  {
    id: 'early_closure',
    title: 'Early closure today',
    category: 'Announcements',
    context: 'broadcast',
    body: 'Dear Parent, school will close early today at 11:00 AM. Please arrange pick-up for {name} accordingly. - {school}',
  },
  {
    id: 'reopening',
    title: 'School reopening',
    category: 'Announcements',
    context: 'broadcast',
    body: 'Dear Parent, school reopens on Monday. Please ensure {name} attends in complete uniform with all books. - {school}',
  },
  {
    id: 'event_invite',
    title: 'Event invitation',
    category: 'Announcements',
    context: 'broadcast',
    body: 'Dear Parent of {name}, you are invited to our annual function this Friday at 9:00 AM. We look forward to seeing you. - {school}',
  },
  {
    id: 'emergency_notice',
    title: 'Urgent notice',
    category: 'Announcements',
    context: 'broadcast',
    body: 'Dear Parent, due to unforeseen circumstances the school is closed today. Please do not send {name}. - {school}',
  },

  // ── Admin ───────────────────────────────────────────────────────────────────
  {
    id: 'documents_pending',
    title: 'Documents pending',
    category: 'Admin',
    context: 'broadcast',
    body: 'Dear Parent, documents for {name} (Adm {admissionNo}) are still pending. Kindly submit them at the office this week. - {school}',
  },
  {
    id: 'uniform_reminder',
    title: 'Uniform / discipline reminder',
    category: 'Admin',
    context: 'broadcast',
    body: 'Dear Parent, please ensure {name} ({class}) comes in complete uniform daily as per school policy. - {school}',
  },
  {
    id: 'transport_change',
    title: 'Transport timing change',
    category: 'Admin',
    context: 'broadcast',
    body: 'Dear Parent, the school van timing has changed. {name} should be ready 15 minutes earlier from tomorrow. - {school}',
  },
];

const CATEGORIES = ['Fees', 'Attendance', 'Exams', 'Announcements', 'Admin'];

module.exports = { TEMPLATES, CATEGORIES, SAMPLE_CONTEXT };
