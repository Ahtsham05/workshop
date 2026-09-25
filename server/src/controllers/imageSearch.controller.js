const catchAsync = require('../utils/catchAsync');
const webImageSearchService = require('../services/webImageSearch.service');

// Public-id prefix per entity, so Cloudinary stays browsable by what the asset is for.
const PREFIXES = {
  product: 'product',
  category: 'category',
  subcategory: 'subcategory',
  brand: 'brand',
};

/**
 * POST /v1/image-search/search
 * Body: { query?, barcode?, page?, perPage?, providers? }
 * Returns ranked candidates as plain URLs — nothing is stored until /import.
 */
const searchImages = catchAsync(async (req, res) => {
  const { query, barcode, page, perPage, providers } = req.body;
  const result = await webImageSearchService.search({ query, barcode, page, perPage, providers });
  res.send(result);
});

/**
 * POST /v1/image-search/import
 * Body: { images: [{ url, token?, provider?, sourceUrl? }], context? }
 * Downloads the picked candidates and uploads them to Cloudinary.
 */
const importImages = catchAsync(async (req, res) => {
  const { images, context = 'product' } = req.body;
  const result = await webImageSearchService.importImages({
    items: images,
    context,
    publicIdPrefix: PREFIXES[context] || 'product',
  });
  res.send(result);
});

module.exports = {
  searchImages,
  importImages,
};
