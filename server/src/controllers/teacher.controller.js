const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { teacherService, userService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');
const { User } = require('../models');

const getScope = (req) => ({
  organizationId: req.organizationId,
  branchId: req.branchId,
});

const createTeacher = catchAsync(async (req, res) => {
  const branchCtx = getBranchContext(req);
  const { portalPassword, ...teacherBody } = req.body;
  const doc = await teacherService.createTeacher({ ...teacherBody, ...branchCtx });

  // Auto-create a portal User for the teacher
  if (doc.email) {
    try {
      // Use provided password, fall back to phone digits, then default
      let rawPassword = portalPassword || (doc.phone ? doc.phone.replace(/\D/g, '') : '') || 'School@1234';
      const password = rawPassword.length >= 8 ? rawPassword : `T${rawPassword}2024!`;
      const emailExists = await User.isEmailTaken(doc.email);
      if (!emailExists) {
        const portalUser = await userService.createUser({
          name: `${doc.firstName} ${doc.lastName}`,
          email: doc.email,
          password,
          organizationId: branchCtx.organizationId,
          systemRole: 'staff',
          businessType: 'school',
          linkedTeacherId: doc._id,
          schoolRole: 'teacher',
          isEmailVerified: true,
        });
        await teacherService.updateTeacherById(doc._id, { userId: portalUser.id }, getScope(req));
        doc.userId = portalUser.id;
      }
    } catch (_err) {
      // User creation failure is non-fatal — teacher record already saved
    }
  }

  res.status(httpStatus.CREATED).send(doc);
});

const getTeachers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['firstName', 'lastName', 'email', 'status', 'employeeId']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.populate = 'subjects,assignedClasses';
  const result = await teacherService.queryTeachers(filter, options);
  res.send(result);
});

const getTeacher = catchAsync(async (req, res) => {
  const doc = await teacherService.getTeacherById(req.params.id, getScope(req));
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Teacher not found');
  await doc.populate('subjects assignedClasses');
  res.send(doc);
});

const updateTeacher = catchAsync(async (req, res) => {
  const doc = await teacherService.updateTeacherById(req.params.id, req.body, getScope(req));
  res.send(doc);
});

const deleteTeacher = catchAsync(async (req, res) => {
  await teacherService.deleteTeacherById(req.params.id, getScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = { createTeacher, getTeachers, getTeacher, updateTeacher, deleteTeacher };
