const { UserQuickLinks } = require('../models');
const { QUICK_LINK_ACTIONS, getVisibleActions, getDefaultActionKeys } = require('../config/quick-link-registry');

const actionsByKey = new Map(QUICK_LINK_ACTIONS.map((action) => [action.actionKey, action]));

const hydrate = (actionKey) => {
  const action = actionsByKey.get(actionKey);
  if (!action) return null;
  const { label, iconKey, color, route, routeSearch, category, synonyms } = action;
  return { actionKey, label, iconKey, color, route, routeSearch, category, synonyms };
};

// Scope carries everything the registry's gating dimensions need (permissions,
// businessType, systemRole, schoolRole, email, bypassPermissions) — passed through
// wholesale rather than hand-picked field by field, so a new gating dimension added to
// the registry doesn't also require updating every call site here.
const listAvailableActions = ({ permissions, ...opts }) =>
  getVisibleActions(permissions, opts).map((action) => hydrate(action.actionKey));

const getOrSeedDoc = async ({ organizationId, branchId, userId, permissions, ...opts }) => {
  let doc = await UserQuickLinks.findOne({ organizationId, branchId, userId });
  // Reseed when there's no doc yet, or the existing one was never explicitly touched
  // by the user (hasCustomized: false) and came out empty — e.g. seeded before this
  // account had any visible actions to default to. A doc the user explicitly cleared
  // (hasCustomized: true) stays empty, since that's a deliberate choice, not a bug.
  if (!doc || (!doc.hasCustomized && doc.links.length === 0)) {
    const defaultKeys = getDefaultActionKeys(permissions, opts);
    const links = defaultKeys.map((actionKey) => ({ actionKey }));
    doc = await UserQuickLinks.findOneAndUpdate(
      { organizationId, branchId, userId },
      { $set: { links }, $setOnInsert: { createdBy: userId } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }
  return doc;
};

/** Drops any actionKey whose action was later deregistered from the master list,
 *  rather than erroring — a stale saved link just silently disappears. */
const hydrateLinks = (links) => links.map((item) => hydrate(item.actionKey)).filter(Boolean);

const getMyQuickLinks = async (scope) => {
  const doc = await getOrSeedDoc(scope);
  return hydrateLinks(doc.links);
};

/** Replaces the whole ordered list in one call — the client manages add/remove/reorder
 *  locally in edit mode and saves once, mirroring how the Leads Kanban's optimistic
 *  stage-change mutation expects a single settled write per user action. */
const updateQuickLinks = async (links, { organizationId, branchId, userId }) => {
  const seen = new Set();
  const cleanLinks = [];
  (links || []).forEach((item) => {
    const actionKey = item && item.actionKey;
    if (!actionKey || !actionsByKey.has(actionKey) || seen.has(actionKey)) return;
    seen.add(actionKey);
    cleanLinks.push({ actionKey });
  });

  const doc = await UserQuickLinks.findOneAndUpdate(
    { organizationId, branchId, userId },
    { $set: { links: cleanLinks, hasCustomized: true }, $setOnInsert: { createdBy: userId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return hydrateLinks(doc.links);
};

const resetQuickLinks = async ({ organizationId, branchId, userId, permissions, ...opts }) => {
  const defaultKeys = getDefaultActionKeys(permissions, opts);
  const doc = await UserQuickLinks.findOneAndUpdate(
    { organizationId, branchId, userId },
    {
      $set: { links: defaultKeys.map((actionKey) => ({ actionKey })), hasCustomized: true },
      $setOnInsert: { createdBy: userId },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return hydrateLinks(doc.links);
};

module.exports = {
  listAvailableActions,
  getMyQuickLinks,
  updateQuickLinks,
  resetQuickLinks,
};
