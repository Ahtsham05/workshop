const httpStatus = require('http-status');
const { Plan } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { DEFAULT_PLANS, ALL_MODULES } = require('../../config/billing');
const { resolvePlanKey } = require('./subscriptionState');

/**
 * Plans are read on every entitlement check, so they are cached in-process for a short TTL.
 * Edits through updatePlan() invalidate this process immediately; other processes (other
 * API instances, the desktop server) pick the change up within CACHE_TTL_MS.
 */
const CACHE_TTL_MS = 30 * 1000;
let cache = { at: 0, byKey: null };

const invalidatePlanCache = () => {
  cache = { at: 0, byKey: null };
};

/**
 * Insert any DEFAULT_PLANS entry whose key is missing. Never overwrites an existing plan, so
 * prices/limits edited in the DB survive restarts and re-seeding.
 * @returns {Promise<string[]>} keys that were inserted
 */
const seedMissingPlans = async () => {
  const existing = await Plan.find({}, 'key').lean();
  const have = new Set(existing.map((p) => p.key));
  const missing = DEFAULT_PLANS.filter((p) => !have.has(p.key));
  if (missing.length) {
    try {
      await Plan.insertMany(missing, { ordered: false });
    } catch (err) {
      // Another process seeded concurrently — duplicate keys are fine.
      if (err.code !== 11000 && !(err.writeErrors || []).every((e) => e.code === 11000)) throw err;
    }
    invalidatePlanCache();
  }
  return missing.map((p) => p.key);
};

const loadPlans = async () => {
  if (cache.byKey && Date.now() - cache.at < CACHE_TTL_MS) return cache.byKey;
  let plans = await Plan.find({}).lean();
  if (!plans.length) {
    await seedMissingPlans();
    plans = await Plan.find({}).lean();
  }
  const byKey = new Map(plans.map((p) => [p.key, p]));
  cache = { at: Date.now(), byKey };
  return byKey;
};

/** @returns {Promise<Object|null>} plan by key (legacy keys aliased), or null */
const getPlan = async (key) => {
  const byKey = await loadPlans();
  return byKey.get(resolvePlanKey(key)) || null;
};

const getPlanOrThrow = async (key) => {
  const plan = await getPlan(key);
  if (!plan) throw new ApiError(httpStatus.BAD_REQUEST, `Unknown plan "${key}"`);
  return plan;
};

/** A plan a customer may buy right now (public + active + has a price). */
const getPurchasablePlanOrThrow = async (key) => {
  const plan = await getPlanOrThrow(key);
  if (!plan.isPublic || !plan.isActive || !(plan.priceUsdMonthly > 0)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `The ${plan.name} plan cannot be purchased`);
  }
  return plan;
};

/** @returns {Promise<Object[]>} plans sorted for display */
const listPlans = async ({ publicOnly = false } = {}) => {
  const byKey = await loadPlans();
  return [...byKey.values()]
    .filter((p) => !publicOnly || (p.isPublic && p.isActive))
    .sort((a, b) => a.sortOrder - b.sortOrder);
};

/** Cheapest purchasable plan that includes `module` — used in "upgrade to X" messages. */
const cheapestPlanWithModule = async (module) => {
  const plans = await listPlans({ publicOnly: true });
  return plans.filter((p) => p.modules.includes(module)).sort((a, b) => a.priceUsdMonthly - b.priceUsdMonthly)[0] || null;
};

/** The Polar product id for the configured Polar server (sandbox/production). */
const polarProductIdFor = (plan, polarServer) =>
  (polarServer === 'production' ? plan.polar?.productionProductId : plan.polar?.sandboxProductId) || null;

/** Reverse lookup: which plan does this Polar product belong to? */
const findPlanByPolarProductId = async (productId, polarServer) => {
  if (!productId) return null;
  const plans = await listPlans();
  return plans.find((p) => polarProductIdFor(p, polarServer) === productId) || null;
};

/** Store a Polar product id on a plan (only fills an empty slot — never overwrites an admin's choice). */
const linkPolarProduct = async (key, polarServer, productId) => {
  const field = `polar.${polarServer === 'production' ? 'productionProductId' : 'sandboxProductId'}`;
  await Plan.updateOne({ key, [field]: null }, { $set: { [field]: productId } });
  invalidatePlanCache();
};

/**
 * Admin edit of a plan's price / limits / modules / Polar product ids / visibility.
 * `key` is immutable — organizations reference it.
 */
const updatePlan = async (key, updates) => {
  const plan = await Plan.findOne({ key });
  if (!plan) throw new ApiError(httpStatus.NOT_FOUND, 'Plan not found');
  const before = plan.toObject();
  if (updates.modules) {
    const unknown = updates.modules.filter((m) => !ALL_MODULES.includes(m));
    if (unknown.length) throw new ApiError(httpStatus.BAD_REQUEST, `Unknown modules: ${unknown.join(', ')}`);
  }
  ['name', 'description', 'badge', 'priceUsdMonthly', 'modules', 'isPublic', 'isActive', 'sortOrder'].forEach((field) => {
    if (updates[field] !== undefined) plan[field] = updates[field];
  });
  if (updates.limits) Object.assign(plan.limits, updates.limits);
  if (updates.polar) Object.assign(plan.polar, updates.polar);
  await plan.save();
  invalidatePlanCache();
  return { before, after: plan.toObject() };
};

module.exports = {
  seedMissingPlans,
  invalidatePlanCache,
  getPlan,
  getPlanOrThrow,
  getPurchasablePlanOrThrow,
  listPlans,
  cheapestPlanWithModule,
  polarProductIdFor,
  findPlanByPolarProductId,
  linkPolarProduct,
  updatePlan,
};
