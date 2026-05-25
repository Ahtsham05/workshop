/**
 * Teacher Portal Controller
 * All endpoints are restricted to the logged-in teacher's TeacherAssignment records.
 */
const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { Teacher, Student, Mark, SchoolAttendance, Exam, Subject, TeacherAssignment, Timetable } = require('../models');

/**
 * Extract the raw branch ObjectId string from a branchId field that may be
 * a plain ObjectId/string OR a populated document { _id, name }.
 */
const extractBranchId = (branchIdField) => {
  if (!branchIdField) return undefined;
  if (typeof branchIdField === 'object' && branchIdField._id) return String(branchIdField._id);
  return String(branchIdField);
};

/**
 * Build query scope.
 *
 * Teacher portal requests intentionally omit the x-branch-id header because
 * teacher users don't have branch Membership records  (they would get 403 from
 * the branchScope membership check if the header were present).
 *
 * To still scope queries to the correct branch, fall back to the teacher
 * record's own branchId when req.branchId is not set by the middleware.
 */
const getScope = (req, teacher) => ({
  organizationId: req.organizationId,
  branchId: req.branchId || extractBranchId(teacher?.branchId),
});

/**
 * Resolve the Teacher record for the currently logged-in user.
 * Populates branchId so the frontend can display the branch name.
 */
const resolveTeacher = async (req) => {
  if (req.user.linkedTeacherId) {
    return Teacher.findById(req.user.linkedTeacherId).populate('branchId', 'name').lean();
  }
  // Fallback: find by userId (no branch scope — we need the teacher to find the branch first)
  return Teacher.findOne({ organizationId: req.organizationId, userId: req.user.id })
    .populate('branchId', 'name')
    .lean();
};

/**
 * Get allowed classIds and sectionIds from TeacherAssignment for this teacher.
 * Falls back to teacher.assignedClasses if no assignments exist yet.
 */
const resolveAssignedScope = async (teacher, scope) => {
  const assignments = await TeacherAssignment.find({
    ...scope,
    teacherId: teacher._id,
  }).lean();

  if (assignments.length > 0) {
    const classIds = [...new Set(assignments.map((a) => String(a.classId)))];
    const sectionIds = [...new Set(assignments.map((a) => String(a.sectionId)))];
    return { classIds, sectionIds, assignments };
  }

  // Legacy fallback: use teacher.assignedClasses
  const classIds = teacher.assignedClasses?.map(String) || [];
  return { classIds, sectionIds: [], assignments: [] };
};

/** GET /teacher-portal/me — teacher profile + assignments */
const getTeacherMe = catchAsync(async (req, res) => {
  const teacher = await resolveTeacher(req);
  if (!teacher) throw new ApiError(httpStatus.NOT_FOUND, 'Teacher profile not found');

  const scope = getScope(req, teacher);
  const { assignments } = await resolveAssignedScope(teacher, scope);
  res.send({ ...teacher, assignments });
});

/** GET /teacher-portal/students — students in teacher's assigned classes+sections only */
const getMyStudents = catchAsync(async (req, res) => {
  const teacher = await resolveTeacher(req);
  if (!teacher) throw new ApiError(httpStatus.FORBIDDEN, 'No teacher profile linked');

  const scope = getScope(req, teacher);
  const { classIds, sectionIds } = await resolveAssignedScope(teacher, scope);

  if (!classIds.length) return res.send([]);

  const filter = { ...scope, classId: { $in: classIds }, status: 'active' };
  if (sectionIds.length) filter.sectionId = { $in: sectionIds };

  const students = await Student.find(filter)
    .populate('classId', 'name')
    .populate('sectionId', 'name')
    .sort({ rollNumber: 1, firstName: 1 })
    .lean();
  res.send(students);
});

/** GET /teacher-portal/exams — exams for teacher's assigned classes */
const getMyExams = catchAsync(async (req, res) => {
  const teacher = await resolveTeacher(req);
  if (!teacher) throw new ApiError(httpStatus.FORBIDDEN, 'No teacher profile linked');

  const scope = getScope(req, teacher);
  const { classIds } = await resolveAssignedScope(teacher, scope);
  if (!classIds.length) return res.send([]);

  const exams = await Exam.find({ ...scope, classId: { $in: classIds } })
    .populate('classId', 'name')
    .sort({ startDate: -1 })
    .lean();
  res.send(exams);
});

/** GET /teacher-portal/subjects — subjects for teacher's assigned classes+sections */
const getMySubjects = catchAsync(async (req, res) => {
  const teacher = await resolveTeacher(req);
  if (!teacher) throw new ApiError(httpStatus.FORBIDDEN, 'No teacher profile linked');

  const scope = getScope(req, teacher);
  const { assignments, classIds } = await resolveAssignedScope(teacher, scope);
  if (!classIds.length) return res.send([]);

  // If we have assignments, return only assigned subjects
  const subjectIds = assignments
    .filter((a) => a.subjectId)
    .map((a) => String(a.subjectId));

  if (subjectIds.length > 0) {
    const subjects = await Subject.find({ ...scope, _id: { $in: subjectIds } })
      .sort({ name: 1 })
      .lean();
    return res.send(subjects);
  }

  // Fallback: all subjects for assigned classes
  const subjects = await Subject.find({ ...scope, classId: { $in: classIds } })
    .sort({ name: 1 })
    .lean();
  res.send(subjects);
});

/** GET /teacher-portal/attendance?classId=&date= — attendance for teacher's classes only */
const getMyAttendance = catchAsync(async (req, res) => {
  const teacher = await resolveTeacher(req);
  if (!teacher) throw new ApiError(httpStatus.FORBIDDEN, 'No teacher profile linked');

  const scope = getScope(req, teacher);
  const { classIds, sectionIds } = await resolveAssignedScope(teacher, scope);

  const filter = { ...scope };
  if (req.query.classId && classIds.includes(String(req.query.classId))) {
    filter.classId = req.query.classId;
  } else if (classIds.length) {
    filter.classId = { $in: classIds };
    if (sectionIds.length) filter.sectionId = { $in: sectionIds };
  } else {
    return res.send([]);
  }
  if (req.query.date) filter.date = new Date(req.query.date);

  const records = await SchoolAttendance.find(filter)
    .populate('studentId', 'firstName lastName admissionNumber rollNumber')
    .sort({ date: -1 })
    .limit(500)
    .lean();
  res.send(records);
});

/** GET /teacher-portal/dashboard — summary stats */
const getDashboard = catchAsync(async (req, res) => {
  const teacher = await resolveTeacher(req);
  if (!teacher) throw new ApiError(httpStatus.NOT_FOUND, 'Teacher profile not found');

  const scope = getScope(req, teacher);
  const { classIds, assignments } = await resolveAssignedScope(teacher, scope);

  const [totalStudents, totalExams, activeExams, todayAttendance, pendingMarks] = await Promise.all([
    classIds.length ? Student.countDocuments({ ...scope, classId: { $in: classIds }, status: 'active' }) : 0,
    classIds.length ? Exam.countDocuments({ ...scope, classId: { $in: classIds } }) : 0,
    classIds.length ? Exam.countDocuments({ ...scope, classId: { $in: classIds }, status: { $in: ['ongoing', 'upcoming'] } }) : 0,
    classIds.length ? SchoolAttendance.countDocuments({
      ...scope,
      classId: { $in: classIds },
      date: { $gte: new Date(new Date().setHours(0,0,0,0)), $lte: new Date(new Date().setHours(23,59,59,999)) },
    }) : 0,
    classIds.length ? Exam.countDocuments({ ...scope, classId: { $in: classIds }, status: 'ongoing' }) : 0,
  ]);

  // Recent exams
  const recentExams = classIds.length ? await Exam.find({ ...scope, classId: { $in: classIds } })
    .populate('classId', 'name')
    .sort({ startDate: -1 })
    .limit(5)
    .lean() : [];

  // Today's timetable (current day name)
  const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const todayDay = days[new Date().getDay()];
  const timetable = classIds.length ? await Timetable.find({ ...scope, classId: { $in: classIds }, day: todayDay, isActive: true })
    .populate('classId', 'name')
    .populate('sectionId', 'name')
    .populate('periods.subjectId', 'name')
    .sort({ 'periods.periodNo': 1 })
    .lean() : [];

  res.send({
    teacher,
    stats: { totalStudents, totalExams, activeExams, todayAttendance, pendingMarks, assignedClasses: classIds.length, assignments: assignments.length },
    recentExams,
    todayTimetable: timetable,
  });
});

/** GET /teacher-portal/timetable — teacher's full weekly timetable */
const getMyTimetable = catchAsync(async (req, res) => {
  const teacher = await resolveTeacher(req);
  if (!teacher) throw new ApiError(httpStatus.FORBIDDEN, 'No teacher profile linked');

  const scope = getScope(req, teacher);
  const { classIds } = await resolveAssignedScope(teacher, scope);
  if (!classIds.length) return res.send([]);

  const timetable = await Timetable.find({ ...scope, classId: { $in: classIds }, isActive: true })
    .populate('classId', 'name')
    .populate('sectionId', 'name')
    .populate('periods.subjectId', 'name code')
    .populate('periods.teacherId', 'firstName lastName')
    .sort({ day: 1, 'periods.periodNo': 1 })
    .lean();
  res.send(timetable);
});

/** GET /teacher-portal/marks?examId=&classId= — get marks for entry */
const getMyMarks = catchAsync(async (req, res) => {
  const teacher = await resolveTeacher(req);
  if (!teacher) throw new ApiError(httpStatus.FORBIDDEN, 'No teacher profile linked');

  const scope = getScope(req, teacher);
  const { classIds } = await resolveAssignedScope(teacher, scope);
  if (!classIds.length) return res.send([]);

  const filter = { ...scope };
  if (req.query.examId) filter.examId = req.query.examId;
  if (req.query.classId && classIds.includes(String(req.query.classId))) filter.classId = req.query.classId;
  else filter.classId = { $in: classIds };

  const marks = await Mark.find(filter)
    .populate('studentId', 'firstName lastName admissionNumber rollNumber')
    .populate('subjectId', 'name code')
    .populate('examId', 'name type totalMarks passingMarks')
    .lean();
  res.send(marks);
});

/** POST /teacher-portal/marks/bulk — save bulk marks */
const saveBulkMarks = catchAsync(async (req, res) => {
  const teacher = await resolveTeacher(req);
  if (!teacher) throw new ApiError(httpStatus.FORBIDDEN, 'No teacher profile linked');

  const scope = getScope(req, teacher);
  const { classIds } = await resolveAssignedScope(teacher, scope);

  const { marks } = req.body; // [{ studentId, subjectId, examId, classId, obtainedMarks, totalMarks, isAbsent }]
  if (!Array.isArray(marks) || !marks.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'marks array required');
  }

  const results = [];
  for (const m of marks) {
    if (!classIds.includes(String(m.classId))) continue; // security check
    const filter = { ...scope, examId: m.examId, studentId: m.studentId, subjectId: m.subjectId };
    const update = { ...scope, ...m, createdBy: req.user.id };
    const result = await Mark.findOneAndUpdate(filter, update, { upsert: true, new: true });
    results.push(result);
  }
  res.send({ saved: results.length });
});

/** POST /teacher-portal/attendance/bulk — mark attendance for a date */
const markBulkAttendance = catchAsync(async (req, res) => {
  const teacher = await resolveTeacher(req);
  if (!teacher) throw new ApiError(httpStatus.FORBIDDEN, 'No teacher profile linked');

  const scope = getScope(req, teacher);
  const { classIds } = await resolveAssignedScope(teacher, scope);

  const { records } = req.body; // [{ studentId, classId, sectionId, date, status, remarks }]
  if (!Array.isArray(records) || !records.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'records array required');
  }

  let saved = 0;
  for (const r of records) {
    if (!classIds.includes(String(r.classId))) continue;
    const date = new Date(r.date);
    date.setHours(0,0,0,0);
    await SchoolAttendance.findOneAndUpdate(
      { ...scope, studentId: r.studentId, date, classId: r.classId },
      { ...scope, ...r, date, markedBy: req.user.id },
      { upsert: true }
    );
    saved++;
  }
  res.send({ saved });
});

/** GET /teacher-portal/exam-students?examId= — students + existing marks for an exam */
const getExamStudents = catchAsync(async (req, res) => {
  const teacher = await resolveTeacher(req);
  if (!teacher) throw new ApiError(httpStatus.FORBIDDEN, 'No teacher profile linked');

  const scope = getScope(req, teacher);
  const { classIds } = await resolveAssignedScope(teacher, scope);
  if (!classIds.length || !req.query.examId) return res.send([]);

  const exam = await Exam.findOne({ ...scope, _id: req.query.examId })
    .populate({ path: 'subjects.subjectId', select: 'name code' })
    .lean();
  if (!exam || !classIds.includes(String(exam.classId))) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Exam not in your assigned classes');
  }

  const [students, existingMarks] = await Promise.all([
    Student.find({ ...scope, classId: exam.classId, status: 'active' })
      .sort({ rollNumber: 1, firstName: 1 })
      .lean(),
    Mark.find({ ...scope, examId: req.query.examId })
      .lean(),
  ]);

  // Attach marks to students
  const marksMap = {};
  existingMarks.forEach((m) => {
    const key = `${m.studentId}_${m.subjectId}`;
    marksMap[key] = m;
  });

  res.send({ exam, students, marksMap });
});

module.exports = {
  getTeacherMe, getMyStudents, getMyExams, getMySubjects, getMyAttendance,
  getDashboard, getMyTimetable, getMyMarks, saveBulkMarks, markBulkAttendance, getExamStudents,
};