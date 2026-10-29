const { UserQuickLinks } = require('../models');
const {
  QUICK_LINK_ACTIONS,
  DEFAULT_ACTION_KEY_ORDER,
  MANUFACTURING_DEFAULT_ACTION_KEY_ORDER,
  getVisibleActions,
  getDefaultActionKeys,
  matchesScope,
} = require('../config/quick-link-registry');

const actionsByKey = new Map(QUICK_LINK_ACTIONS.map((action) => [action.actionKey, action]));

/**
 * Each user has one Quick Links board per screen, all on the same UserQuickLinks doc:
 *  dashboard     — the main dashboard: every action the caller may see
 *  manufacturing — the Manufacturing Overview: only the Manufacturing actions
 * `links`/`customized` name the doc fields holding that board's picks.
 */
const BOARDS = {
  dashboard: {
    links: 'links',
    customized: 'hasCustomized',
    defaults: DEFAULT_ACTION_KEY_ORDER,
    offers: () => true,
  },
  manufacturing: {
    links: 'manufacturingLinks',
    customized: 'manufacturingCustomized',
    defaults: MANUFACTURING_DEFAULT_ACTION_KEY_ORDER,
    offers: (action) => action.category === 'Manufacturing',
  },
};
const boardOf = (board) => BOARDS[board] || BOARDS.dashboard;

const toDto = (action) => {
  const { actionKey, label, iconKey, color, route, routeSearch, category, synonyms } = action;
  return { actionKey, label, iconKey, color, route, routeSearch, category, synonyms };
};

// Scope carries everything the registry's gating dimensions need (permissions,
// businessType, systemRole, schoolRole, email, bypassPermissions, manufacturingEnabled) —
// passed through wholesale rather than hand-picked field by field, so a new gating
// dimension added to the registry doesn't also require updating every call site here.
const listAvailableActions = ({ permissions, ...opts }, board) =>
  getVisibleActions(permissions, opts)
    .filter((action) => boardOf(board).offers(action))
    .map(toDto);

const defaultKeysFor = ({ permissions, ...opts }, board) => getDefaultActionKeys(permissions, opts, boardOf(board).defaults);

const getOrSeedDoc = async (scope, board) => {
  const { organizationId, branchId, userId } = scope;
  const fields = boardOf(board);
  let doc = await UserQuickLinks.findOne({ organizationId, branchId, userId });
  // Reseed when there's no doc yet, or the board was never explicitly touched by the
  // user (customized: false) and came out empty — e.g. seeded before this account had
  // any visible actions to default to. A board the user explicitly cleared
  // (customized: true) stays empty, since that's a deliberate choice, not a bug.
  if (!doc || (!doc[fields.customized] && !(doc[fields.links] || []).length)) {
    const links = defaultKeysFor(scope, board).map((actionKey) => ({ actionKey }));
    doc = await UserQuickLinks.findOneAndUpdate(
      { organizationId, branchId, userId },
      { $set: { [fields.links]: links }, $setOnInsert: { createdBy: userId } },
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
const hydrateVisibleLinks = (links, scope, board) =>
  (links || [])
    .map((item) => actionsByKey.get(item.actionKey))
    .filter((action) => action && boardOf(board).offers(action) && matchesScope(action, scope))
    .map(toDto);

const getMyQuickLinks = async (scope, board) => {
  const doc = await getOrSeedDoc(scope, board);
  return hydrateVisibleLinks(doc[boardOf(board).links], scope, board);
};

/** Replaces the whole ordered list in one call — the client manages add/remove/reorder
 *  locally in edit mode and saves once, mirroring how the Leads Kanban's optimistic
 *  stage-change mutation expects a single settled write per user action. */
const updateQuickLinks = async (links, scope, board) => {
  const { organizationId, branchId, userId } = scope;
  const fields = boardOf(board);
  const seen = new Set();
  const cleanLinks = [];
  (links || []).forEach((item) => {
    const actionKey = item && item.actionKey;
    const action = actionKey && actionsByKey.get(actionKey);
    if (!action || !fields.offers(action) || seen.has(actionKey)) return;
    seen.add(actionKey);
    cleanLinks.push({ actionKey });
  });

  const doc = await UserQuickLinks.findOneAndUpdate(
    { organizationId, branchId, userId },
    { $set: { [fields.links]: cleanLinks, [fields.customized]: true }, $setOnInsert: { createdBy: userId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return hydrateVisibleLinks(doc[fields.links], scope, board);
};

const resetQuickLinks = async (scope, board) => {
  const { organizationId, branchId, userId } = scope;
  const fields = boardOf(board);
  const doc = await UserQuickLinks.findOneAndUpdate(
    { organizationId, branchId, userId },
    {
      $set: {
        [fields.links]: defaultKeysFor(scope, board).map((actionKey) => ({ actionKey })),
        [fields.customized]: true,
      },
      $setOnInsert: { createdBy: userId },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return hydrateVisibleLinks(doc[fields.links], scope, board);
};

module.exports = {
  BOARDS,
  listAvailableActions,
  getMyQuickLinks,
  updateQuickLinks,
  resetQuickLinks,
};
