/**
 * Which time zone a request's business dates are computed in: the caller's organization zone
 * (Settings → Localization → Time zone), else its country's single zone, else the default
 * (Asia/Karachi — what every org ran on before the setting existed).
 *
 * `auth`/`sseAuth` call `applyUserBusinessTimeZone(req.user)` once the user is known; everything
 * downstream reads it through utils/businessTimezone.js#getBusinessTimeZone().
 */
const { Organization } = require('../models');
const { getCountryDefaults } = require('../config/countries');
const {
  DEFAULT_BUSINESS_TZ,
  isValidTimeZone,
  runWithBusinessTimeZone,
  setBusinessTimeZone,
} = require('../utils/businessTimezone');

// Short TTL: a change made on another server instance shows up within a minute; on this one it
// is cleared immediately (organization.controller.js#updateOrganization).
const CACHE_TTL_MS = 60 * 1000;
const GRACE_MS = 24 * 60 * 60 * 1000;
const cache = new Map();

/** Response header carrying the zone, so every open browser of the business follows a change. */
const TIME_ZONE_HEADER = 'X-Business-Time-Zone';

/** Effective zone for an org document (or lean object) — no DB access. */
const timeZoneForOrganization = (org) => {
  if (!org) return DEFAULT_BUSINESS_TZ;
  if (isValidTimeZone(org.timeZone)) return org.timeZone;
  const countryZone = getCountryDefaults(org.countryCode).timeZone;
  return isValidTimeZone(countryZone) ? countryZone : DEFAULT_BUSINESS_TZ;
};

/** `{ timeZone, graceTimeZone, graceUntil }` for an org (cached). */
const resolveOrganizationZones = async (organizationId) => {
  if (!organizationId) return { timeZone: DEFAULT_BUSINESS_TZ, graceTimeZone: null, graceUntil: 0 };
  const key = String(organizationId);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const org = await Organization.findById(key).select('timeZone countryCode timeZoneChange').lean();
  const timeZone = timeZoneForOrganization(org);
  const change = (org && org.timeZoneChange) || {};
  const graceUntil = change.at ? new Date(change.at).getTime() + GRACE_MS : 0;
  const value = {
    timeZone,
    graceTimeZone: graceUntil > Date.now() && isValidTimeZone(change.from) && change.from !== timeZone ? change.from : null,
    graceUntil,
  };
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
};

const resolveOrganizationTimeZone = async (organizationId) => (await resolveOrganizationZones(organizationId)).timeZone;

const clearOrganizationTimeZone = (organizationId) => {
  if (organizationId) cache.delete(String(organizationId));
};

/**
 * Point the current request's business zone at the user's organization, and tell the browser
 * which zone that is (response header) so every open tab of every user switches with a change.
 * Never throws.
 */
const applyUserBusinessTimeZone = async (user, res) => {
  if (!user || !user.organizationId) return;
  try {
    const { timeZone, graceTimeZone, graceUntil } = await resolveOrganizationZones(user.organizationId);
    setBusinessTimeZone(timeZone, graceUntil > Date.now() ? graceTimeZone : null);
    if (res && !res.headersSent) res.setHeader(TIME_ZONE_HEADER, timeZone);
  } catch (e) {
    // Falls back to the default zone — a lookup hiccup must not fail the request.
  }
};

/** Run background work (schedulers) for one org in that org's zone. */
const runWithOrganizationTimeZone = async (organizationId, fn) =>
  runWithBusinessTimeZone(await resolveOrganizationTimeZone(organizationId).catch(() => DEFAULT_BUSINESS_TZ), fn);

module.exports = {
  TIME_ZONE_HEADER,
  timeZoneForOrganization,
  resolveOrganizationZones,
  resolveOrganizationTimeZone,
  clearOrganizationTimeZone,
  applyUserBusinessTimeZone,
  runWithOrganizationTimeZone,
};
