const { endOfBusinessDay, toBusinessCalendarDate } = require('../utils/businessTimezone');

const objectId = (value, helpers) => {
  if (!value.match(/^[0-9a-fA-F]{24}$/)) {
    return helpers.message('"{{#label}}" must be a valid mongo id');
  }
  return value;
};

/**
 * Rejects dates after the end of today in the business timezone (Asia/Karachi) —
 * for event dates that record when a cash-affecting transaction actually happened
 * (a sale, a load purchase, a payment received). A mis-set future date here silently
 * creates a future-dated cash-book entry that inflates "Cash in Hand" ahead of what's
 * physically in the drawer until that date arrives. Not for scheduling fields like an
 * installment plan's nextDueDate, which are legitimately meant to be in the future.
 */
const notFutureDate = (value, helpers) => {
  const maxAllowed = endOfBusinessDay(toBusinessCalendarDate(new Date()));
  if (new Date(value).getTime() > maxAllowed.getTime()) {
    return helpers.message('"{{#label}}" cannot be a future date');
  }
  return value;
};

const password = (value, helpers) => {
  if (value.length < 8) {
    return helpers.message('password must be at least 8 characters');
  }
  if (!value.match(/\d/) || !value.match(/[a-zA-Z]/)) {
    return helpers.message('password must contain at least 1 letter and 1 number');
  }
  return value;
};

module.exports = {
  objectId,
  password,
  notFutureDate,
};
