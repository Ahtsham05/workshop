const mongoose = require('mongoose');
const { Student, Mark, SchoolAttendance, FeeVoucher, Exam, Subject, SchoolClass } = require('../models');

const toObjectId = (id) =>
  id && mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : null;

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

/** Overall exam % from a student's marks (same rules as progress report). */
const studentExamPercentage = (marks) => {
  let obtained = 0;
  let max = 0;
  marks.forEach((m) => {
    if (!m.isAbsent) {
      obtained += Number(m.obtainedMarks || 0);
      max += Number(m.totalMarks || 0);
    }
  });
  return max > 0 ? Math.round((obtained / max) * 100) : null;
};

/** Highest overall percentage among active students in the class for one exam. */
const getHighestPercentageInClass = async (examId, classId, scope = {}) => {
  if (!examId || !classId) return null;
  const tf = getTenantFilter(scope);
  const classStudents = await Student.find({ ...tf, classId, status: 'active' }).select('_id').lean();
  if (!classStudents.length) return null;

  const studentIds = classStudents.map((s) => s._id);
  const marks = await Mark.find({ ...tf, examId, studentId: { $in: studentIds } }).lean();

  const byStudent = {};
  marks.forEach((m) => {
    const sid = String(m.studentId);
    if (!byStudent[sid]) byStudent[sid] = [];
    byStudent[sid].push(m);
  });

  let highest = null;
  Object.values(byStudent).forEach((studentMarks) => {
    const pct = studentExamPercentage(studentMarks);
    if (pct !== null && (highest === null || pct > highest)) {
      highest = pct;
    }
  });

  return highest;
};

const formatStudentPayload = (student) => ({
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
});

const buildFeeStats = (vouchers) => {
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
  feeStats.unpaidCount = vouchers.filter((v) => v.status !== 'paid').length;
  return feeStats;
};

const buildAttendancePayload = (total, present) => {
  const attendancePct = total > 0 ? Math.round((present / total) * 100) : null;
  return {
    total,
    present,
    absent: total - present,
    percentage: attendancePct,
    hasRecords: total > 0,
  };
};

const buildExamResultFromMarks = (marks, highestPercentageInClass = null) => {
  if (!marks.length) return null;

  const exam = marks[0].examId;
  let totalObtained = 0;
  let totalMax = 0;
  const subjects = marks.map((m) => {
    const pct = m.isAbsent ? 0 : m.totalMarks > 0 ? Math.round((m.obtainedMarks / m.totalMarks) * 100) : 0;
    if (!m.isAbsent) {
      totalObtained += m.obtainedMarks || 0;
      totalMax += m.totalMarks || 0;
    }
    return {
      subjectId: m.subjectId?._id,
      subjectName: m.subjectId?.name || '—',
      subjectCode: m.subjectId?.code || '',
      totalMarks: m.totalMarks,
      obtainedMarks: m.isAbsent ? null : m.obtainedMarks,
      percentage: m.isAbsent ? null : pct,
      grade: m.isAbsent ? 'AB' : calcGrade(pct).grade,
      isAbsent: m.isAbsent,
      remarks: m.remarks || '',
    };
  });

  const pct = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100) : 0;
  return {
    exam,
    subjects,
    totalObtained,
    totalMax,
    percentage: pct,
    ...calcGrade(pct),
    highestPercentageInClass,
  };
};

const buildExamsFromMarks = async (marks, classId, scope) => {
  const examMap = {};
  marks.forEach((m) => {
    const eid = m.examId?._id?.toString() || String(m.examId);
    if (!examMap[eid]) {
      examMap[eid] = {
        exam: m.examId,
        marks: [],
      };
    }
    examMap[eid].marks.push(m);
  });

  return Promise.all(
    Object.values(examMap).map(async (entry) => {
      const examRefId = entry.exam?._id || entry.exam;
      const highestPercentageInClass =
        examRefId && classId ? await getHighestPercentageInClass(examRefId, classId, scope) : null;
      return buildExamResultFromMarks(entry.marks, highestPercentageInClass);
    })
  );
};

const indexByStudentId = (rows, key = '_id') => {
  const map = {};
  rows.forEach((row) => {
    map[String(row[key])] = row;
  });
  return map;
};

/** N/Play and N/Education report half of actual active enrollment as class strength. */
const HALF_STRENGTH_CLASS_NAMES = new Set(['n/play', 'n/education']);

const applyHalfStrengthIfNeeded = (count, classRef) => {
  if (!count || !classRef) return count;
  const name = (classRef.name || '').trim().toLowerCase();
  if (HALF_STRENGTH_CLASS_NAMES.has(name)) return Math.round(count / 2);
  return count;
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

  const classId = student.classId?._id || student.classId;
  const classStrengthRaw = classId
    ? await Student.countDocuments({ ...tf, classId, status: 'active' })
    : 0;
  const classStrength = applyHalfStrengthIfNeeded(classStrengthRaw, student.classId);

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
  // 4. Fee summary
  const vouchers = await FeeVoucher.find({ ...tf, studentId, status: { $ne: 'cancelled' } }).lean();
  const feeStats = buildFeeStats(vouchers);

  const examsResult = await buildExamsFromMarks(marks, classId, scope);

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
    student: formatStudentPayload(student),
    attendance: buildAttendancePayload(totalAtt, presentAtt),
    classStrength,
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
 * Bulk progress reports for a class + exam in one request.
 * @param {{ classId: string, examId: string, sectionId?: string, studentIds?: string[] }} params
 */
const getClassProgressReportsBulk = async ({ classId, examId, sectionId, studentIds }, scope = {}) => {
  const tf = getTenantFilter(scope);
  const classOid = toObjectId(classId);
  const examOid = toObjectId(examId);
  if (!classOid || !examOid) return null;

  const exam = await Exam.findOne({ _id: examOid, ...tf }).lean();
  if (!exam) return null;

  const examClassId = exam.classId?._id || exam.classId;
  if (String(examClassId) !== String(classOid)) {
    return { exam: null, error: 'Exam does not belong to this class' };
  }

  const studentFilter = { ...tf, classId: classOid, status: 'active' };
  if (sectionId) {
    const sectionOid = toObjectId(sectionId);
    if (sectionOid) studentFilter.sectionId = sectionOid;
  }
  if (studentIds?.length) {
    const ids = studentIds.map(toObjectId).filter(Boolean);
    if (ids.length) studentFilter._id = { $in: ids };
  }

  const students = await Student.find(studentFilter)
    .populate('classId', 'name order')
    .populate('sectionId', 'name')
    .sort({ rollNumber: 1, firstName: 1 })
    .lean();

  if (!students.length) {
    return {
      exam: { id: exam._id, name: exam.name, type: exam.type },
      classStrength: 0,
      highestPercentageInClass: null,
      reports: [],
      meta: { requested: 0, withResults: 0 },
    };
  }

  const ids = students.map((s) => s._id);
  const [classStrengthRaw, classDoc, allMarks, attendanceRows, feeRows] = await Promise.all([
    Student.countDocuments({ ...tf, classId: classOid, status: 'active' }),
    SchoolClass.findOne({ _id: classOid, ...tf }).select('name').lean(),
    Mark.find({ ...tf, examId: examOid, studentId: { $in: ids } })
      .populate('subjectId', 'name code')
      .populate('examId', 'name type startDate totalMarks passingMarks')
      .lean(),
    SchoolAttendance.aggregate([
      { $match: { ...tf, studentId: { $in: ids } } },
      {
        $group: {
          _id: '$studentId',
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
        },
      },
    ]),
    FeeVoucher.aggregate([
      { $match: { ...tf, studentId: { $in: ids }, status: { $ne: 'cancelled' } } },
      {
        $group: {
          _id: '$studentId',
          totalDue: { $sum: { $ifNull: ['$netAmount', '$totalAmount'] } },
          totalPaid: { $sum: { $ifNull: ['$paidAmount', 0] } },
          voucherCount: { $sum: 1 },
          unpaidCount: {
            $sum: { $cond: [{ $ne: ['$status', 'paid'] }, 1, 0] },
          },
        },
      },
    ]),
  ]);

  const classStrength = applyHalfStrengthIfNeeded(classStrengthRaw, classDoc);

  const marksByStudent = {};
  allMarks.forEach((m) => {
    const sid = String(m.studentId);
    if (!marksByStudent[sid]) marksByStudent[sid] = [];
    marksByStudent[sid].push(m);
  });

  let highestPercentageInClass = null;
  Object.values(marksByStudent).forEach((studentMarks) => {
    const pct = studentExamPercentage(studentMarks);
    if (pct !== null && (highestPercentageInClass === null || pct > highestPercentageInClass)) {
      highestPercentageInClass = pct;
    }
  });

  const attendanceByStudent = indexByStudentId(attendanceRows);
  const feesByStudent = indexByStudentId(feeRows);

  const emptyFees = {
    totalDue: 0,
    totalPaid: 0,
    balance: 0,
    voucherCount: 0,
    unpaidCount: 0,
  };

  const reports = [];
  students.forEach((student) => {
    const sid = String(student._id);
    const studentMarks = marksByStudent[sid];
    if (!studentMarks?.length) return;

    const att = attendanceByStudent[sid];
    const totalAtt = att?.total || 0;
    const presentAtt = att?.present || 0;

    const feeRow = feesByStudent[sid];
    const fees = feeRow
      ? {
          totalDue: feeRow.totalDue || 0,
          totalPaid: feeRow.totalPaid || 0,
          balance: Math.max(0, (feeRow.totalDue || 0) - (feeRow.totalPaid || 0)),
          voucherCount: feeRow.voucherCount || 0,
          unpaidCount: feeRow.unpaidCount || 0,
        }
      : { ...emptyFees };

    const examResult = buildExamResultFromMarks(studentMarks, highestPercentageInClass);
    if (!examResult) return;

    reports.push({
      student: formatStudentPayload(student),
      attendance: buildAttendancePayload(totalAtt, presentAtt),
      classStrength,
      fees,
      exams: [examResult],
      overall: {
        totalObtained: examResult.totalObtained,
        totalMax: examResult.totalMax,
        percentage: examResult.percentage,
        grade: examResult.grade,
        label: examResult.label,
      },
    });
  });

  return {
    exam: { id: exam._id, name: exam.name, type: exam.type },
    classStrength,
    highestPercentageInClass,
    reports,
    meta: {
      requested: students.length,
      withResults: reports.length,
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

module.exports = {
  getStudentProgressReport,
  getClassProgressReportsBulk,
  getExamResultSheet,
  calcGrade,
};
