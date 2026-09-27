const crypto = require('crypto');
const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const websiteConnectionService = require('../services/websiteConnection.service');
const { Organization } = require('../models');

const orgOf = (req) => req.organizationId || req.user.organizationId;

// --- management (signed-in staff) ---

const listConnections = catchAsync(async (req, res) => {
  res.send(await websiteConnectionService.listConnections(orgOf(req)));
});

const createConnection = catchAsync(async (req, res) => {
  const { connection, apiKey } = await websiteConnectionService.createConnection(orgOf(req), req.user.id, req.body);
  // The only response that ever contains the key.
  res.status(httpStatus.CREATED).send({ connection, apiKey });
});

const updateConnection = catchAsync(async (req, res) => {
  res.send(await websiteConnectionService.updateConnection(orgOf(req), req.user.id, req.params.connectionId, req.body));
});

const rotateKey = catchAsync(async (req, res) => {
  const { connection, apiKey } = await websiteConnectionService.rotateKey(orgOf(req), req.user.id, req.params.connectionId);
  res.send({ connection, apiKey });
});

const deleteConnection = catchAsync(async (req, res) => {
  await websiteConnectionService.deleteConnection(orgOf(req), req.params.connectionId);
  res.status(httpStatus.NO_CONTENT).send();
});

/** What the website would receive right now — the first page, for checking the setup. */
const previewConnection = catchAsync(async (req, res) => {
  const connection = await websiteConnectionService.getConnection(orgOf(req), req.params.connectionId);
  res.send(await websiteConnectionService.listProducts(connection.toObject(), { page: 1, limit: 10 }));
});

// --- storefront (the website, by API key) ---

/**
 * Sends `body` with an ETag; a repeat request carrying it gets 304 and no body, so a website
 * polling for changes only downloads the catalog when something actually changed.
 */
const sendWithEtag = (req, res, body) => {
  const json = JSON.stringify(body);
  const etag = `"${crypto.createHash('sha1').update(json).digest('base64url')}"`;
  res.set('ETag', etag);
  res.set('Cache-Control', 'private, no-cache');
  if (req.headers['if-none-match'] === etag) return res.status(httpStatus.NOT_MODIFIED).end();
  return res.type('application/json').send(json);
};

const splitList = (value) =>
  String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

const storefrontProducts = catchAsync(async (req, res) => {
  const { page, limit, search, inStock } = req.query;
  sendWithEtag(req, res, await websiteConnectionService.listProducts(req.websiteConnection, { page, limit, search, inStockOnly: inStock === true || inStock === 'true' }));
});

const storefrontProduct = catchAsync(async (req, res) => {
  sendWithEtag(req, res, await websiteConnectionService.getProduct(req.websiteConnection, req.params.ref));
});

const storefrontStock = catchAsync(async (req, res) => {
  sendWithEtag(
    req,
    res,
    await websiteConnectionService.listStock(req.websiteConnection, { ids: splitList(req.query.ids), codes: splitList(req.query.codes) })
  );
});

const storefrontInfo = catchAsync(async (req, res) => {
  const { name, websiteUrl, safetyStock, organizationId } = req.websiteConnection;
  const organization = await Organization.findById(organizationId).select('name baseCurrency').lean();
  res.send({ business: organization?.name || null, connection: name, websiteUrl, safetyStock, currency: organization?.baseCurrency || 'PKR' });
});

module.exports = {
  listConnections,
  createConnection,
  updateConnection,
  rotateKey,
  deleteConnection,
  previewConnection,
  storefrontProducts,
  storefrontProduct,
  storefrontStock,
  storefrontInfo,
};
