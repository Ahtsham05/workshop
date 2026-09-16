/**
 * Aggregation-pipeline equivalents of the JS semantics that dashboard totals were originally
 * written against, for code that moves a `find()` + `Array.reduce` sum into `$group` so the
 * database does the summing (see mobileDashboard.service.js / dashboard.controller.js).
 */

/**
 * Mongoose fills in a schema default when hydrating a document that lacks the field; an
 * aggregation sees the raw stored document. Restores the default for legacy rows written
 * before the field existed. Only a truly missing field gets it — a stored `null` stays null,
 * exactly as hydration leaves it.
 */
const withDefault = (field, defaultValue) => ({
  $cond: [{ $eq: [{ $type: field }, 'missing'] }, defaultValue, field],
});

/** `value || fallback` — falls through on 0, null, missing, false and ''. */
const truthyOr = (value, fallback) => ({
  $cond: [{ $in: [{ $ifNull: [value, 0] }, [0, false, '']] }, fallback, value],
});

/** `value ?? 0` for arithmetic — `$sum` already skips null/missing, `$subtract` does not. */
const orZero = (value) => ({ $ifNull: [value, 0] });

module.exports = {
  withDefault,
  truthyOr,
  orZero,
};
