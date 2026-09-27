const crypto = require('crypto');
const httpStatus = require('http-status');
const rateLimit = require('express-rate-limit');
const ApiError = require('../utils/ApiError');
const websiteConnectionService = require('../services/websiteConnection.service');

/** The key from `X-Api-Key: <key>` or `Authorization: Bearer <key>`. */
const readKey = (req) => {
  const header = req.headers['x-api-key'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
};

/**
 * Authenticates a website by its API key (see websiteConnection.service.js) and attaches
 * the connection as `req.websiteConnection`. Every storefront route is behind this.
 */
const websiteKeyAuth = async (req, res, next) => {
  try {
    const connection = await websiteConnectionService.authenticateKey(readKey(req));
    if (!connection) {
      return next(new ApiError(httpStatus.UNAUTHORIZED, 'Missing, invalid or disabled website API key'));
    }
    req.websiteConnection = connection;
    return next();
  } catch (err) {
    return next(err);
  }
};

/**
 * Per key, not per IP: a website's server makes every call from one address, and one
 * misbehaving site must not slow another. 240 a minute covers polling stock every few
 * seconds plus normal browsing. In-process counts (per server instance).
 */
const websiteRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  keyGenerator: (req) => {
    const key = readKey(req);
    return key ? crypto.createHash('sha256').update(key).digest('hex') : `ip:${req.ip}`;
  },
  handler: (req, res, next) => next(new ApiError(httpStatus.TOO_MANY_REQUESTS, 'Too many requests for this website key — slow down')),
});

module.exports = { websiteKeyAuth, websiteRateLimit };
