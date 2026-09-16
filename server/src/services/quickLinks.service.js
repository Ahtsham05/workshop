const { UserQuickLinks } = require('../models');
const {
  QUICK_LINK_ACTIONS,
  getVisibleActions,
  getDefaultActionKeys,
  matchesScope,
} = require('../config/quick-link-registry');

const actionsByKey = new Map(QUICK_LINK_ACTIONS.map((action) => [action.actionKey, action]));

const toDto = (action) => {
  const { actionKey, label, iconKey, color, route, routeSearch, category, synonyms } = action;
  return { actionKey, label, iconKey, color, route, routeSearch, category, synonyms };
};

// Scope carries everything the registry's gating dimensions need (permissions,
// businessType, systemRole, schoolRole, email, bypassPermissions) — passed through
// wholesale rather than hand-picked field by field, so a new gating dimension added to
// the registry doesn't also require updating every call site here.
const listAvailableActions = ({ permissions, ...opts }) => getVisibleActions(permissions, opts).map(toDto);

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

/** Drops any saved actionKey whose action was later deregistered from the master
 *  list, AND re-checks every gating dimension (business type, permission, role, …)
 *  against the caller's *current* scope — not just at first-seed time. Without this,
 *  a pick that was valid when saved but later excluded (a registry gate added after
 *  the fact, an org's business type set, a permission revoked) would keep silently
 *  showing forever, since a saved link is otherwise only ever removed by explicit user
 *  action. Either way the philosophy is the same: a stale saved link just silently
 *  disappears on the next read, no error, no migration needed. */
const hydrateVisibleLinks = (links, scope) =>
  links
    .map((item) => actionsByKey.get(item.actionKey))
    .filter((action) => action && matchesScope(action, scope))
    .map(toDto);

const getMyQuickLinks = async (scope) => {
  const doc = await getOrSeedDoc(scope);
  return hydrateVisibleLinks(doc.links, scope);
};

/** Replaces the whole ordered list in one call — the client manages add/remove/reorder
 *  locally in edit mode and saves once, mirroring how the Leads Kanban's optimistic
 *  stage-change mutation expects a single settled write per user action. */
const updateQuickLinks = async (links, scope) => {
  const { organizationId, branchId, userId } = scope;
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
  return hydrateVisibleLinks(doc.links, scope);
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
  return hydrateVisibleLinks(doc.links, { organizationId, branchId, userId, permissions, ...opts });
};

module.exports = {
  listAvailableActions,
  getMyQuickLinks,
  updateQuickLinks,
  resetQuickLinks,
};
