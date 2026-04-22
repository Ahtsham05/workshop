const httpStatus = require('http-status');
const { TeacherAssignment } = require('../models');
const ApiError = require('../utils/ApiError');

const getTenantFilter = (data = {}) => {
  const filter = {};
  if (data.organizationId) filter.organizationId = data.organizationId;
  if (data.branchId) filter.branchId = data.branchId;
  return filter;
};

/**
 * Create a teacher assignment.
 * Enforces: only one class teacher per class+section.
 */
const createAssignment = async (body) => {
  const scope = getTenantFilter(body);

  // If marking as class teacher, check no other class teacher exists for same class+section
  if (body.isClassTeacher) {
    const existing = await TeacherAssignment.findOne({
      ...scope,
      classId: body.classId,
      sectionId: body.sectionId,
      isClassTeacher: true,
    });
    if (existing) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'A class teacher is already assigned to this class/section');
    }
  }

  // Check for exact duplicate (same teacher, class, section, subject)
  const duplicate = await TeacherAssignment.findOne({
    ...scope,
    teacherId: body.teacherId,
    classId: body.classId,
    sectionId: body.sectionId,
    subjectId: body.subjectId || null,
  });
  if (duplicate) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This assignment already exists');
  }

  try {
    return await TeacherAssignment.create(body);
  } catch (error) {
    // Handle race-condition duplicates from unique index enforcement
    if (error && error.code === 11000) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'This assignment already exists');
    }
    throw error;
  }
};

/**
 * Query assignments with pagination.
 */
const queryAssignments = async (filter, options) => {
  const populateOpts = [
    { path: 'teacherId', select: 'firstName lastName employeeId' },
    { path: 'classId', select: 'name' },
    { path: 'sectionId', select: 'name' },
    { path: 'subjectId', select: 'name' },
  ];
  options.populate = populateOpts;
  return TeacherAssignment.paginate(filter, options);
};

/**
 * Get all assignments for a given teacher.
 * Returns structured access lists for portal filtering.
 */
const getAssignmentsByTeacher = async (teacherId, scope = {}) => {
  const assignments = await TeacherAssignment.find({
    ...getTenantFilter(scope),
    teacherId,
  })
    .populate('classId', 'name')
    .populate('sectionId', 'name')
    .populate('subjectId', 'name')
    .lean();

  const classIds = [...new Set(assignments.map((a) => String(a.classId?._id || a.classId)))];
  const sectionIds = [...new Set(assignments.map((a) => String(a.sectionId?._id || a.sectionId)))];
  const subjectIds = [...new Set(assignments.filter((a) => a.subjectId).map((a) => String(a.subjectId?._id || a.subjectId)))];

  return { assignments, classIds, sectionIds, subjectIds };
};

/**
 * Get assignment by id.
 */
const getAssignmentById = async (id, scope = {}) => {
  return TeacherAssignment.findOne({ _id: id, ...getTenantFilter(scope) })
    .populate('teacherId', 'firstName lastName employeeId')
    .populate('classId', 'name')
    .populate('sectionId', 'name')
    .populate('subjectId', 'name');
};

/**
 * Delete an assignment.
 */
const deleteAssignmentById = async (id, scope = {}) => {
  const doc = await TeacherAssignment.findOne({ _id: id, ...getTenantFilter(scope) });
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Assignment not found');
  await doc.deleteOne();
  return doc;
};

/**
 * Get class overview: all classes with their assigned teachers per section.
 */
const getClassOverview = async (scope = {}) => {
  const assignments = await TeacherAssignment.find(getTenantFilter(scope))
    .populate('teacherId', 'firstName lastName employeeId')
    .populate('classId', 'name')
    .populate('sectionId', 'name')
    .populate('subjectId', 'name')
    .lean();

  // Group by classId → sectionId → subjects/teachers
  const overview = {};
  for (const a of assignments) {
    const classId = String(a.classId?._id || a.classId);
    const sectionId = String(a.sectionId?._id || a.sectionId);

    if (!overview[classId]) {
      overview[classId] = {
        classId,
        className: a.classId?.name || classId,
        sections: {},
      };
    }
    if (!overview[classId].sections[sectionId]) {
      overview[classId].sections[sectionId] = {
        sectionId,
        sectionName: a.sectionId?.name || sectionId,
        classTeacher: null,
        subjects: [],
      };
    }

    if (a.isClassTeacher) {
      overview[classId].sections[sectionId].classTeacher = {
        teacherId: String(a.teacherId?._id || a.teacherId),
        name: a.teacherId ? `${a.teacherId.firstName} ${a.teacherId.lastName}` : 'Unknown',
        employeeId: a.teacherId?.employeeId,
      };
    }

    if (a.subjectId) {
      overview[classId].sections[sectionId].subjects.push({
        assignmentId: String(a._id),
        subjectId: String(a.subjectId?._id || a.subjectId),
        subjectName: a.subjectId?.name || 'Unknown',
        teacherId: String(a.teacherId?._id || a.teacherId),
        teacherName: a.teacherId ? `${a.teacherId.firstName} ${a.teacherId.lastName}` : 'Unknown',
      });
    }
  }

  // Convert to array
  return Object.values(overview).map((cls) => ({
    ...cls,
    sections: Object.values(cls.sections),
  }));
};

module.exports = {
  createAssignment,
  queryAssignments,
  getAssignmentsByTeacher,
  getAssignmentById,
  deleteAssignmentById,
  getClassOverview,
};
