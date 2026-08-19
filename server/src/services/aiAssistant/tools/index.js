const { normalizeBusinessType } = require('../../../config/businessTypes');
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
 *    margins, salaries, ledgers — their UI wouldn't otherwise show them. Fails CLOSED:
 *    a tool with a permission requirement is hidden unless ctx.permissions explicitly
 *    grants it, or ctx.isSystemAdmin bypasses checks the same way systemRole does
 *    everywhere else in the app (see middlewares/permission.js).
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
    if (!tool.permission) return true;
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
