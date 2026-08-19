const { normalizeBusinessType } = require('../../../config/businessTypes');
const { PERMISSION_KEYS } = require('../../../config/permission-registry');
const sales = require('./sales');
const receivables = require('./receivables');
const inventory = require('./inventory');
const purchasing = require('./purchasing');
const expenses = require('./expenses');
const banking = require('./banking');
const installments = require('./installments');
const repairs = require('./repairs');
const salesmen = require('./salesmen');
const lookup = require('./lookup');
const actions = require('./actions');

const ALL_TOOLS = [
  ...sales.declarations,
  ...receivables.declarations,
  ...inventory.declarations,
  ...purchasing.declarations,
  ...expenses.declarations,
  ...banking.declarations,
  ...installments.declarations,
  ...repairs.declarations,
  ...salesmen.declarations,
  ...lookup.declarations,
  ...actions.declarations,
];

// Every tool here reaches real business data — there is no legitimate "public, no permission
// needed" tool in this catalog, unlike a general-purpose API. buildToolset()'s filter below
// silently treats a missing `permission` as "always allowed" (fail-OPEN), which is exactly
// backwards from the "fails CLOSED" behavior its own docstring promises — get_top_products and
// get_top_customers shipped with no `permission` at all and were reachable by any user who could
// merely open the assistant, found in the 2026-08-19 security audit. Rather than trust every
// future tool author to remember to set one, fail loudly at startup instead of silently at
// runtime: every tool must declare a `permission` that's a real, non-typo'd key from the app's
// actual permission registry (a typo'd key would silently deny it to everyone but admins instead
// — a quieter, but still real, bug).
ALL_TOOLS.forEach((tool) => {
  if (!tool.permission) {
    throw new Error(`AI assistant tool "${tool.name}" has no \`permission\` set — every tool must declare one.`);
  }
  const required = Array.isArray(tool.permission) ? tool.permission : [tool.permission];
  const unknown = required.filter((key) => !PERMISSION_KEYS.includes(key));
  if (unknown.length > 0) {
    throw new Error(`AI assistant tool "${tool.name}" declares unknown permission(s): ${unknown.join(', ')}`);
  }
});

/**
 * Filters ALL_TOOLS down to what this specific request may see, then splits into the
 * shape Gemini's function-calling API needs (bare {name, description, parameters}, no
 * metadata) plus a name->handler lookup for the tool-calling loop.
 *
 * Two independent filters:
 *  - businessTypes: only relevant for verticals like "repair jobs" that don't exist for
 *    every org — keeps the catalog (and therefore tool-selection accuracy/token cost)
 *    scoped to modules the org actually uses.
 *  - permission: mirrors the app's own RBAC (client's <Can permission="..."> / server's
 *    auth('...')) so the assistant can never hand a low-privilege role data — profit
 *    margins, salaries, ledgers — their UI wouldn't otherwise show them. Every tool is
 *    guaranteed to have a real `permission` by the startup check above, so this genuinely
 *    fails closed — hidden unless ctx.permissions explicitly grants it, or ctx.isSystemAdmin
 *    bypasses checks the same way systemRole does everywhere else in the app (see
 *    middlewares/permission.js).
 *
 * @param {{organizationId: string, branchId?: string, permissions?: Record<string, boolean>, isSystemAdmin?: boolean}} ctx
 * @param {{businessType?: string}} businessContext
 */
function buildToolset(ctx, businessContext = {}) {
  const businessType = normalizeBusinessType(businessContext.businessType);
  const isAdmin = ctx.isSystemAdmin === true;
  const permissions = ctx.permissions || {};

  const allowed = ALL_TOOLS.filter((tool) => {
    if (tool.businessTypes && !tool.businessTypes.includes(businessType)) return false;
    if (isAdmin) return true;
    const required = Array.isArray(tool.permission) ? tool.permission : [tool.permission];
    return required.some((p) => permissions[p] === true);
  });

  return {
    TOOL_DECLARATIONS: allowed.map(({ name, description, parameters }) => ({ name, description, parameters })),
    TOOL_HANDLERS: Object.fromEntries(allowed.map((t) => [t.name, t.handler])),
  };
}

module.exports = { buildToolset };
