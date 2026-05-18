const httpStatus = require('http-status');
const ApiError = require('./ApiError');

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isQuotaError(message) {
  const m = String(message || '').toLowerCase();
  return (
    m.includes('quota') ||
    m.includes('rate limit') ||
    m.includes('resource exhausted') ||
    m.includes('limit: 0')
  );
}

function isModelError(message) {
  const m = String(message || '').toLowerCase();
  return m.includes('not found') || m.includes('not supported') || m.includes('is not supported');
}

function isTemporaryCapacityError(message, statusCode) {
  const m = String(message || '').toLowerCase();
  if (statusCode === 503 || statusCode === 429) return true;
  return (
    m.includes('high demand') ||
    m.includes('overloaded') ||
    m.includes('unavailable') ||
    m.includes('try again later') ||
    m.includes('temporarily unavailable') ||
    m.includes('spikes in demand')
  );
}

function createGeminiApiError(message, statusCode) {
  const temporary = isTemporaryCapacityError(message, statusCode);
  const quota = isQuotaError(message);
  const model = isModelError(message);

  let httpCode = httpStatus.BAD_GATEWAY;
  if (quota) httpCode = httpStatus.TOO_MANY_REQUESTS;
  else if (temporary) httpCode = httpStatus.SERVICE_UNAVAILABLE;

  const err = new ApiError(httpCode, message);
  err.isQuotaError = quota;
  err.isModelError = model;
  err.isTemporaryCapacity = temporary;
  err.isRetryable = quota || model || temporary;
  return err;
}

/**
 * Try Gemini vision models with per-model retries (handles "high demand" spikes).
 * @param {object} opts
 * @param {string[]} opts.models
 * @param {(model: string) => Promise<object>} opts.callModel
 * @param {number} [opts.attemptsPerModel]
 * @returns {Promise<{ response: object, modelUsed: string }>}
 */
async function callGeminiWithFallback({ models, callModel, attemptsPerModel = 3 }) {
  const tried = [];
  let lastError = null;

  for (const model of models) {
    for (let attempt = 0; attempt < attemptsPerModel; attempt += 1) {
      if (attempt > 0) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(800 * attempt);
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        const response = await callModel(model);
        return { response, modelUsed: model };
      } catch (error) {
        lastError = error;
        if (!error.isRetryable) {
          throw error;
        }
        tried.push(`${model}${attempt > 0 ? `(retry${attempt})` : ''}`);
      }
    }
  }

  const hint =
    lastError?.isTemporaryCapacity || lastError?.isQuotaError
      ? ' Gemini is busy — wait 30–60 seconds and try again, or use "Add manually (no scan)".'
      : '';

  throw new ApiError(
    httpStatus.BAD_GATEWAY,
    `AI scan failed after trying: ${[...new Set(tried)].join(', ')}.${hint}`,
  );
}

module.exports = {
  sleep,
  isQuotaError,
  isModelError,
  isTemporaryCapacityError,
  createGeminiApiError,
  callGeminiWithFallback,
};
