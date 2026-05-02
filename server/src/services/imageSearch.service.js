const https = require('https');
const http = require('http');
const { URL } = require('url');
const httpStatus = require('http-status');
const config = require('../config/config');
const { uploadToCloudinary } = require('../middlewares/upload');
const ApiError = require('../utils/ApiError');

/**
 * Download remote image into a buffer (follows redirects, size cap).
 */
function downloadUrlToBuffer(imageUrl, maxBytes = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const fetch = (urlString, depth = 0) => {
      if (depth > 6) {
        reject(new Error('Too many redirects'));
        return;
      }
      const u = new URL(urlString);
      const lib = u.protocol === 'https:' ? https : http;
      lib
        .get(
          urlString,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; WorkshopApp/1.0)',
              Accept: 'image/*,*/*;q=0.8',
            },
          },
          (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              res.resume();
              fetch(new URL(res.headers.location, urlString).href, depth + 1);
              return;
            }
            if (res.statusCode !== 200) {
              res.resume();
              reject(new ApiError(httpStatus.BAD_GATEWAY, `Could not download image (HTTP ${res.statusCode})`));
              return;
            }
            const chunks = [];
            let size = 0;
            res.on('data', (chunk) => {
              size += chunk.length;
              if (size > maxBytes) {
                res.destroy();
                reject(new ApiError(httpStatus.BAD_REQUEST, 'Image file is too large'));
                return;
              }
              chunks.push(chunk);
            });
            res.on('end', () => resolve(Buffer.concat(chunks)));
          },
        )
        .on('error', reject);
    };
    fetch(imageUrl);
  });
}

function httpsGetJson(urlString, headers = {}) {
  return new Promise((resolve, reject) => {
    https
      .get(urlString, { headers }, (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new ApiError(httpStatus.BAD_GATEWAY, `Pexels API returned ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new ApiError(httpStatus.BAD_GATEWAY, 'Invalid response from image search'));
          }
        });
      })
      .on('error', reject);
  });
}

/**
 * Search Pexels for the first matching photo, upload to Cloudinary, return secure URL + public id.
 * Requires PEXELS_API_KEY in server config.
 *
 * @param {string} query
 * @param {{ folder: 'products' | 'categories', publicIdPrefix: string }} opts
 */
async function searchPexelsAndUpload(query, opts) {
  const apiKey = config.pexels?.apiKey;
  if (!apiKey || !String(apiKey).trim()) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'Stock photo search is not configured. Add PEXELS_API_KEY to the server environment (free at pexels.com/api).',
    );
  }

  const trimmed = String(query || '').trim();
  if (trimmed.length < 2) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Enter at least 2 characters to search for an image.');
  }

  const q = encodeURIComponent(trimmed.slice(0, 200));
  const searchUrl = `https://api.pexels.com/v1/search?query=${q}&per_page=1&orientation=landscape`;

  const json = await httpsGetJson(searchUrl, {
    Authorization: apiKey,
  });

  if (!json.photos || json.photos.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No stock photos found for that name. Try different wording.');
  }

  const photo = json.photos[0];
  const src = photo.src || {};
  const imageUrl = src.large2x || src.large || src.original || src.medium;
  if (!imageUrl) {
    throw new ApiError(httpStatus.BAD_GATEWAY, 'Could not resolve image URL from search provider.');
  }

  const buffer = await downloadUrlToBuffer(imageUrl);
  const folder = opts.folder === 'categories' ? 'categories' : 'products';
  const prefix = opts.publicIdPrefix || 'stock';

  const result = await uploadToCloudinary(buffer, {
    folder,
    public_id: `${prefix}_pexels_${Date.now()}`,
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
    photographer: photo.photographer || '',
    providerUrl: photo.url || 'https://www.pexels.com',
  };
}

module.exports = {
  searchPexelsAndUpload,
};
