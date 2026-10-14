/**
 * Private storage for files attached to production orders (drawings, specs, QC
 * certificates, photos). Same approach as billing/proofStorage.js: Cloudinary type
 * 'private' (no public URL), downloads only through a signed, expiring URL, and the storage
 * key is generated server-side under the organization, so a client can't point a document at
 * somebody else's file. Anything that isn't a PDF or an image can be attached as a link.
 */
const crypto = require('crypto');
const httpStatus = require('http-status');
const cloudinary = require('../../config/cloudinary');
const ApiError = require('../../utils/ApiError');
const { sniffMimeType } = require('../billing/proofStorage');

const MAX_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 10 * 60;
const FORMAT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

/** @returns {{ mimeType: string, bytes: number }} — the type is sniffed from the bytes, not trusted. */
const validateFile = (file) => {
  if (!file || !file.buffer) throw new ApiError(httpStatus.BAD_REQUEST, 'Choose a file to upload');
  if (file.size > MAX_BYTES)
    throw new ApiError(httpStatus.BAD_REQUEST, `The file is too large (max ${MAX_BYTES / 1024 / 1024} MB)`);
  const mimeType = sniffMimeType(file.buffer);
  if (!mimeType || !FORMAT_BY_MIME[mimeType]) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Upload a PDF, JPG, PNG or WEBP file — add anything else as a link');
  }
  return { mimeType, bytes: file.size };
};

const cloudinaryStorage = {
  save: (buffer, { organizationId, mimeType }) =>
    new Promise((resolve, reject) => {
      const publicId = `manufacturing-docs/${organizationId}/${crypto.randomBytes(12).toString('hex')}`;
      cloudinary.uploader
        .upload_stream(
          {
            public_id: publicId,
            type: 'private',
            resource_type: 'image',
            format: FORMAT_BY_MIME[mimeType],
            overwrite: false,
          },
          (err, result) => (err ? reject(err) : resolve(`${result.public_id}.${FORMAT_BY_MIME[mimeType]}`))
        )
        .end(buffer);
    }),
  signedUrl: (storageKey) => {
    const dot = storageKey.lastIndexOf('.');
    return cloudinary.utils.private_download_url(storageKey.slice(0, dot), storageKey.slice(dot + 1), {
      type: 'private',
      resource_type: 'image',
      expires_at: Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS,
    });
  },
  remove: async (storageKey) => {
    await cloudinary.uploader.destroy(storageKey.slice(0, storageKey.lastIndexOf('.')), {
      type: 'private',
      resource_type: 'image',
    });
  },
};

let storage = cloudinaryStorage;

/** Test hook: swap in an in-memory store. */
const setStorageForTests = (fake) => {
  storage = fake || cloudinaryStorage;
};

module.exports = {
  MAX_BYTES,
  validateFile,
  save: (...args) => storage.save(...args),
  signedUrl: (...args) => storage.signedUrl(...args),
  remove: (...args) => storage.remove(...args),
  setStorageForTests,
};
