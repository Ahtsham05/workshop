const { Student, Mark, SchoolAttendance, FeeVoucher, Exam, Subject } = require('../models');

const getTenantFilter = (scope = {}) => {
  const f = {};
  if (scope.organizationId) f.organizationId = scope.organizationId;
  if (scope.branchId) f.branchId = scope.branchId;
  return f;
};

/**
 * Calculate letter grade based on percentage
 */
const calcGrade = (pct) => {
  if (pct >= 90) return { grade: 'A+', label: 'Outstanding' };
  if (pct >= 80) return { grade: 'A', label: 'Excellent' };
  if (pct >= 70) return { grade: 'B', label: 'Very Good' };
  if (pct >= 60) return { grade: 'C', label: 'Good' };
  if (pct >= 50) return { grade: 'D', label: 'Satisfactory' };
  if (pct >= 33) return { grade: 'E', label: 'Pass' };
  return { grade: 'F', label: 'Fail' };
};

/**
 * Generate complete progress report for a student.
 * Optionally filter by a specific examId.
 */
const getStudentProgressReport = async (studentId, scope = {}, examId = null) => {
  const tf = getTenantFilter(scope);

  // 1. Student with class/section
  const student = await Student.findOne({ _id: studentId, ...tf })
    .populate('classId', 'name order')
    .populate('sectionId', 'name')
    .lean();

  if (!student) return null;

  // 2. Marks — for one exam or all exams
  const marksFilter = { ...tf, studentId };
  if (examId) marksFilter.examId = examId;

  const marks = await Mark.find(marksFilter)
    .populate('subjectId', 'name code')
    .populate('examId', 'name type startDate totalMarks passingMarks')
    .lean();

  // 3. Attendance stats (all time or academic year)
  const attFilter = { ...tf, studentId };
  const [totalAtt, presentAtt] = await Promise.all([
    SchoolAttendance.countDocuments(attFilter),
    SchoolAttendance.countDocuments({ ...attFilter, status: 'present' }),
  ]);
  const attendancePct = totalAtt > 0 ? Math.round((presentAtt / totalAtt) * 100) : null;

  // 4. Fee summary — query FeeVoucher (active vouchers, not cancelled)
  const vouchers = await FeeVoucher.find({ ...tf, studentId, status: { $ne: 'cancelled' } }).lean();
  const feeStats = vouchers.reduce(
    (acc, v) => {
      acc.totalDue += v.netAmount || v.totalAmount || 0;
      acc.totalPaid += v.paidAmount || 0;
      return acc;
    },
    { totalDue: 0, totalPaid: 0 }
  );
  feeStats.balance = Math.max(0, feeStats.totalDue - feeStats.totalPaid);
  feeStats.voucherCount = vouchers.length;
  feeStats.unpaidCount = vouchers.filter(v => v.status !== 'paid').length;

  // 5. Group marks by exam
  const examMap = {};
  marks.forEach((m) => {
    const eid = m.examId?._id?.toString() || String(m.examId);
    if (!examMap[eid]) {
      examMap[eid] = {
        exam: m.examId,
        subjects: [],
        totalObtained: 0,
        totalMax: 0,
      };
    }
    const pct = m.isAbsent ? 0 : m.totalMarks > 0 ? Math.round((m.obtainedMarks / m.totalMarks) * 100) : 0;
    examMap[eid].subjects.push({
      subjectId: m.subjectId?._id,
      subjectName: m.subjectId?.name || '—',
      subjectCode: m.subjectId?.code || '',
      totalMarks: m.totalMarks,
      obtainedMarks: m.isAbsent ? null : m.obtainedMarks,
      percentage: m.isAbsent ? null : pct,
      grade: m.isAbsent ? 'AB' : calcGrade(pct).grade,
      isAbsent: m.isAbsent,
      remarks: m.remarks || '',
    });
    if (!m.isAbsent) {
      examMap[eid].totalObtained += m.obtainedMarks || 0;
      examMap[eid].totalMax += m.totalMarks || 0;
    }
  });

  const examsResult = Object.values(examMap).map((e) => {
    const pct = e.totalMax > 0 ? Math.round((e.totalObtained / e.totalMax) * 100) : 0;
    return {
      ...e,
      percentage: pct,
      ...calcGrade(pct),
    };
  });

  // 6. Overall aggregate (across all exams in report)
  let grandObtained = 0;
  let grandMax = 0;
  examsResult.forEach((e) => {
    grandObtained += e.totalObtained;
    grandMax += e.totalMax;
  });
  const overallPct = grandMax > 0 ? Math.round((grandObtained / grandMax) * 100) : 0;
  const overall = calcGrade(overallPct);

  return {
    student: {
      id: student._id,
      admissionNumber: student.admissionNumber,
      rollNumber: student.rollNumber || '',
      firstName: student.firstName,
      lastName: student.lastName || '',
      gender: student.gender,
      dateOfBirth: student.dateOfBirth,
      photoUrl: student.photoUrl?.url || null,
      className: student.classId?.name || '—',
      sectionName: student.sectionId?.name || '',
      nationality: student.nationality || '',
      parent: {
        fatherName: student.parent?.fatherName || '',
        motherName: student.parent?.motherName || '',
        phone: student.parent?.phone || '',
      },
    },
    attendance: {
      total: totalAtt,
      present: presentAtt,
      absent: totalAtt - presentAtt,
      percentage: attendancePct,
    },
    fees: feeStats,
    exams: examsResult,
    overall: {
      totalObtained: grandObtained,
      totalMax: grandMax,
      percentage: overallPct,
      grade: overall.grade,
      label: overall.label,
    },
  };
};

/**
 * Get class-wide result sheet for one exam (spreadsheet-style).
 * Returns { students: [...], subjects: [...], rows: [...] }
 */
const getExamResultSheet = async (examId, scope = {}) => {
  const tf = getTenantFilter(scope);

  const exam = await Exam.findOne({ _id: examId, ...tf }).populate('classId', 'name').lean();
  if (!exam) return null;

  const [marks, students, subjects] = await Promise.all([
    Mark.find({ ...tf, examId })
      .populate('studentId', 'firstName lastName rollNumber admissionNumber gender photoUrl')
      .populate('subjectId', 'name code')
      .lean(),
    Student.find({ ...tf, classId: exam.classId?._id || exam.classId, status: 'active' })
      .sort({ rollNumber: 1, firstName: 1 })
      .lean(),
    Subject.find({ ...tf, classId: exam.classId?._id || exam.classId }).sort({ name: 1 }).lean(),
  ]);

  // Build lookup: studentId → subjectId → mark
  const lookup = {};
  marks.forEach((m) => {
    const sid = m.studentId?._id?.toString() || String(m.studentId);
    const subid = m.subjectId?._id?.toString() || String(m.subjectId);
    if (!lookup[sid]) lookup[sid] = {};
    lookup[sid][subid] = m;
  });

  const rows = students.map((s) => {
    const sid = s._id.toString();
    let totalObtained = 0;
    let totalMax = 0;
    const subjectMarks = subjects.map((sub) => {
      const subid = sub._id.toString();
      const m = lookup[sid]?.[subid];
      let obtained = null;
      let isAbsent = false;
      if (m) {
        isAbsent = m.isAbsent;
        obtained = m.isAbsent ? null : m.obtainedMarks;
        if (!isAbsent) {
          totalObtained += m.obtainedMarks || 0;
          totalMax += m.totalMarks || exam.totalMarks || 100;
        }
      } else {
        totalMax += exam.totalMarks || 100;
      }
      const pct = totalMax > 0 && obtained !== null ? Math.round((obtained / (exam.totalMarks || 100)) * 100) : null;
      return {
        subjectId: sub._id,
        obtained,
        isAbsent,
        grade: isAbsent ? 'AB' : obtained !== null ? calcGrade(pct).grade : '—',
      };
    });
    const pct = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100) : 0;
    return {
      studentId: s._id,
      admissionNumber: s.admissionNumber,
      rollNumber: s.rollNumber || '—',
      name: `${s.firstName} ${s.lastName || ''}`.trim(),
      gender: s.gender,
      subjectMarks,
      totalObtained,
      totalMax,
      percentage: pct,
      grade: calcGrade(pct).grade,
    };
  });

  return {
    exam: { id: exam._id, name: exam.name, type: exam.type, className: exam.classId?.name, totalMarks: exam.totalMarks, passingMarks: exam.passingMarks, startDate: exam.startDate },
    subjects: subjects.map((s) => ({ id: s._id, name: s.name, code: s.code })),
    rows,
  };
};

module.exports = { getStudentProgressReport, getExamResultSheet, calcGrade };
