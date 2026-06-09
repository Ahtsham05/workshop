const config = require('../../../config/config');
const { Student, SchoolAttendance, FeeVoucher, Mark, Exam, Diary, Timetable } = require('../../../models');
const { normalizePhone } = require('../../../utils/whatsappPhone');

const INTENTS = ['attendance', 'fee_balance', 'result', 'homework', 'timetable', 'exam_date', 'verify', 'unknown'];

function detectLanguage(text) {
  const t = String(text || '').toLowerCase();
  if (/[\u0600-\u06FF]/.test(t)) return 'ur';
  if (/\b(ki|di|da|de|kinni|puttar|fee|result|attendance)\b/i.test(t)) return 'roman_ur';
  if (/\b(puttar|parivar|school)\b/i.test(t) && /[\u0A00-\u0A7F]/.test(t)) return 'pa';
  return 'en';
}

function classifyIntent(text) {
  const t = String(text || '').toLowerCase();
  if (/fee|balance|dues|baki|reh gai|kinni|payment/i.test(t)) return 'fee_balance';
  if (/attendance|present|absent|hazri|hazri/i.test(t)) return 'attendance';
  if (/result|marks|grade|number/i.test(t)) return 'result';
  if (/homework|diary|assignment|kaam/i.test(t)) return 'homework';
  if (/timetable|schedule|period/i.test(t)) return 'timetable';
  if (/exam|test|paper/i.test(t)) return 'exam_date';
  if (/admission|verify|student id|roll/i.test(t)) return 'verify';
  return 'unknown';
}

function extractStudentName(text) {
  const patterns = [
    /(?:what is|show|check|tell me)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)\s+(?:attendance|fee|result)/i,
    /([a-zA-Z]+(?:\s+[a-zA-Z]+)?)\s+(?:da|di|ki|de)\s+(?:result|fee|attendance)/i,
    /(?:mera|mere|my)\s+(?:beta|beti|puttar|daughter|son)\s+([a-zA-Z]+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

async function findStudentsForConversation(conversation, nameHint) {
  const filter = {
    organizationId: conversation.organizationId,
    branchId: conversation.branchId,
    status: 'active',
  };
  if (conversation.linkedStudentIds?.length) {
    return Student.find({ _id: { $in: conversation.linkedStudentIds } }).populate('classId sectionId');
  }
  if (nameHint) {
    const parts = nameHint.split(/\s+/);
    filter.$or = [
      { firstName: new RegExp(parts[0], 'i') },
      { lastName: new RegExp(parts[parts.length - 1], 'i') },
    ];
  }
  return Student.find(filter).limit(5).populate('classId sectionId');
}

async function verifyParentByAdmission(conversation, admissionNumber) {
  const student = await Student.findOne({
    organizationId: conversation.organizationId,
    branchId: conversation.branchId,
    admissionNumber: String(admissionNumber).trim(),
    'parent.phone': { $regex: conversation.contactPhone.slice(-10) },
  });
  if (!student) return null;
  conversation.verifiedParent = true;
  conversation.linkedStudentIds = [student._id];
  conversation.parentUserId = student.parentUserId;
  conversation.aiSessionActive = true;
  await conversation.save();
  return student;
}

async function resolveAttendance(student) {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const records = await SchoolAttendance.find({
    organizationId: student.organizationId,
    branchId: student.branchId,
    studentId: student._id,
    date: { $gte: monthStart },
  }).sort({ date: -1 });
  const present = records.filter((r) => r.status === 'present').length;
  const absent = records.filter((r) => r.status === 'absent').length;
  return { studentName: `${student.firstName} ${student.lastName}`.trim(), present, absent, total: records.length };
}

async function resolveFeeBalance(student) {
  const vouchers = await FeeVoucher.find({
    organizationId: student.organizationId,
    branchId: student.branchId,
    studentId: student._id,
    status: { $in: ['unpaid', 'partial', 'overdue'] },
  });
  const totalDue = vouchers.reduce((sum, v) => sum + Math.max(0, (v.netAmount || v.totalAmount || 0) - (v.paidAmount || 0)), 0);
  return {
    studentName: `${student.firstName} ${student.lastName}`.trim(),
    totalDue,
    voucherCount: vouchers.length,
    currency: 'PKR',
  };
}

async function resolveResult(student) {
  const marks = await Mark.find({
    organizationId: student.organizationId,
    branchId: student.branchId,
    studentId: student._id,
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('examId subjectId');
  return {
    studentName: `${student.firstName} ${student.lastName}`.trim(),
    marks: marks.map((m) => ({
      subject: m.subjectId?.name,
      exam: m.examId?.name,
      obtained: m.obtainedMarks,
      total: m.totalMarks,
    })),
  };
}

async function resolveHomework(student) {
  const diaries = await Diary.find({
    organizationId: student.organizationId,
    branchId: student.branchId,
    classId: student.classId,
    sectionId: student.sectionId || null,
  })
    .sort({ date: -1 })
    .limit(3);
  return {
    studentName: `${student.firstName} ${student.lastName}`.trim(),
    entries: diaries.flatMap((d) =>
      (d.items || []).map((item) => ({
        date: d.date,
        subject: item.subjectName,
        homework: item.homework,
        classwork: item.classwork,
      })),
    ),
  };
}

async function resolveTimetable(student) {
  const slots = await Timetable.find({
    organizationId: student.organizationId,
    branchId: student.branchId,
    classId: student.classId,
    sectionId: student.sectionId || undefined,
    isActive: true,
  }).populate('periods.subjectId periods.timeSlotId');
  return {
    studentName: `${student.firstName} ${student.lastName}`.trim(),
    slots: slots.flatMap((s) =>
      (s.periods || []).map((p) => ({
        day: s.day,
        subject: p.subjectId?.name,
        time: p.timeSlotId?.label || `${p.startTime}-${p.endTime}`,
      })),
    ),
  };
}

async function resolveExamDate(student) {
  const exams = await Exam.find({
    organizationId: student.organizationId,
    branchId: student.branchId,
    classId: student.classId,
    startDate: { $gte: new Date() },
  })
    .sort({ startDate: 1 })
    .limit(5);
  return {
    studentName: `${student.firstName} ${student.lastName}`.trim(),
    exams: exams.map((e) => ({ name: e.name, startDate: e.startDate, endDate: e.endDate })),
  };
}

async function resolve(intent, student) {
  switch (intent) {
    case 'attendance':
      return resolveAttendance(student);
    case 'fee_balance':
      return resolveFeeBalance(student);
    case 'result':
      return resolveResult(student);
    case 'homework':
      return resolveHomework(student);
    case 'timetable':
      return resolveTimetable(student);
    case 'exam_date':
      return resolveExamDate(student);
    default:
      return null;
  }
}

function formatReply(intent, data, language) {
  if (!data) {
    const msgs = {
      en: 'Sorry, I could not find that information.',
      ur: 'معذرت، معلومات نہیں مل سکی۔',
      pa: 'Maaf karo, jankari nahi mili.',
      roman_ur: 'Maaf kijiye, maloomat nahi mili.',
    };
    return msgs[language] || msgs.en;
  }

  if (intent === 'fee_balance') {
    if (language === 'roman_ur' || language === 'pa') {
      return `${data.studentName} di baqi fee Rs. ${data.totalDue} hai (${data.voucherCount} voucher).`;
    }
    if (language === 'ur') {
      return `${data.studentName} کی باقی فیس Rs. ${data.totalDue} ہے۔`;
    }
    return `${data.studentName}'s outstanding fee balance is Rs. ${data.totalDue} (${data.voucherCount} voucher(s)).`;
  }

  if (intent === 'attendance') {
    if (language === 'roman_ur' || language === 'pa') {
      return `${data.studentName}: is mahine ${data.present} din present, ${data.absent} din absent.`;
    }
    return `${data.studentName}: This month ${data.present} present, ${data.absent} absent (${data.total} days recorded).`;
  }

  if (intent === 'result' && data.marks?.length) {
    const lines = data.marks.map((m) => `${m.subject || 'Subject'}: ${m.obtained}/${m.total}`).join('\n');
    return `${data.studentName} results:\n${lines}`;
  }

  return JSON.stringify(data, null, 2).slice(0, 1000);
}

async function callGeminiReply(userText, data, language) {
  if (!config.gemini.apiKey) return null;
  const prompt = `Reply as a school parent assistant in ${language}. User asked: "${userText}". Data: ${JSON.stringify(data)}. Keep reply under 500 chars.`;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}:generateContent?key=${config.gemini.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );
    const body = await res.json();
    return body.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  } catch {
    return null;
  }
}

module.exports = {
  INTENTS,
  detectLanguage,
  classifyIntent,
  extractStudentName,
  findStudentsForConversation,
  verifyParentByAdmission,
  resolve,
  formatReply,
  callGeminiReply,
};
