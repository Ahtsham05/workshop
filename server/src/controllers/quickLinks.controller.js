const catchAsync = require('../utils/catchAsync');
const { quickLinksService } = require('../services');
const { Organization } = require('../models');

/**
 * No fine-grained permission gates these routes (unlike most other features) — this is
 * purely per-user personalization with no sensitive data of its own, and each offered
 * action is already filtered by that action's own underlying permission below. Gating
 * behind a dedicated key would mean every existing Role document defaults to false on
 * that key until backfilled, locking everyone out of a brand-new feature on deploy day.
 */
const getScope = async (req) => {
  if (!req.user.role || typeof req.user.role === 'string') {
    await req.user.populate('role');
  }
  const organizationId = req.organizationId || req.user.organizationId;
  let { businessType } = req.user;
  if (organizationId) {
    const org = await Organization.findById(organizationId).select('businessType');
    if (org && org.businessType) businessType = org.businessType;
  }

  // Same derivation dashboard/index.tsx uses client-side: a linked-teacher account
  // without an explicit schoolRole is still effectively a teacher for gating purposes.
  const schoolRole = req.user.schoolRole || (req.user.linkedTeacherId ? 'teacher' : null);

  return {
    organizationId,
    branchId: req.branchId,
    userId: req.user.id,
    permissions: (req.user.role && req.user.role.permissions) || {},
    businessType,
    systemRole: req.user.systemRole,
    schoolRole,
    email: req.user.email,
    bypassPermissions: req.user.systemRole === 'superAdmin' || req.user.systemRole === 'system_admin',
  };
};

const getAvailableActions = catchAsync(async (req, res) => {
  const scope = await getScope(req);
  res.send(quickLinksService.listAvailableActions(scope));
});

const getMyQuickLinks = catchAsync(async (req, res) => {
  const scope = await getScope(req);
  const links = await quickLinksService.getMyQuickLinks(scope);
  res.send(links);
});

const updateQuickLinks = catchAsync(async (req, res) => {
  const scope = await getScope(req);
  const links = await quickLinksService.updateQuickLinks(req.body.links, scope);
  res.send(links);
});

const resetQuickLinks = catchAsync(async (req, res) => {
  const scope = await getScope(req);
  const links = await quickLinksService.resetQuickLinks(scope);
  res.send(links);
});

module.exports = {
  getAvailableActions,
  getMyQuickLinks,
  updateQuickLinks,
  resetQuickLinks,
};
