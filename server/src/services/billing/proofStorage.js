/**
 * Private storage for manual-payment proof files.
 *
 * Files are uploaded to Cloudinary with type 'private': the asset has no public URL, and the
 * only way to fetch it is a signed, expiring download URL minted here for platform admins.
 * The storage key is generated server-side from the organization id, so a client can never
 * point a submission at somebody else's file.
 */
const crypto = require('crypto');
const httpStatus = require('http-status');
const cloudinary = require('../../config/cloudinary');
const ApiError = require('../../utils/ApiError');
const { PROOF_UPLOAD } = require('../../config/billing');

/** Detect the real file type from magic bytes — the client-supplied mimetype is not trusted. */
const sniffMimeType = (buffer) => {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP')
    return 'image/webp';
  if (buffer.slice(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
};

const FORMAT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

/**
 * @param {{ buffer: Buffer, size: number }} file multer memory file
 * @returns {{ mimeType: string, bytes: number }}
 */
const validateProofFile = (file) => {
  if (!file || !file.buffer) throw new ApiError(httpStatus.BAD_REQUEST, 'Attach a screenshot or PDF of the payment.');
  if (file.size > PROOF_UPLOAD.maxBytes) {
    throw new ApiError(httpStatus.BAD_REQUEST, `The file is too large (max ${PROOF_UPLOAD.maxBytes / 1024 / 1024} MB).`);
  }
  const mimeType = sniffMimeType(file.buffer);
  if (!mimeType || !PROOF_UPLOAD.mimeTypes.includes(mimeType)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Upload a JPG, PNG, WEBP or PDF file.');
  }
  return { mimeType, bytes: file.size };
};

const cloudinaryStorage = {
  save: (buffer, { organizationId, mimeType }) =>
    new Promise((resolve, reject) => {
      const publicId = `billing-proofs/${organizationId}/${crypto.randomBytes(12).toString('hex')}`;
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
    const publicId = storageKey.slice(0, dot);
    const format = storageKey.slice(dot + 1);
    return cloudinary.utils.private_download_url(publicId, format, {
      type: 'private',
      resource_type: 'image',
      expires_at: Math.floor(Date.now() / 1000) + PROOF_UPLOAD.signedUrlTtlSeconds,
    });
  },
  remove: async (storageKey) => {
    const publicId = storageKey.slice(0, storageKey.lastIndexOf('.'));
    await cloudinary.uploader.destroy(publicId, { type: 'private', resource_type: 'image' });
  },
};

let storage = cloudinaryStorage;

/** Test hook: swap in an in-memory store. */
const setStorageForTests = (fake) => {
  storage = fake || cloudinaryStorage;
};

module.exports = {
  sniffMimeType,
  validateProofFile,
  save: (...args) => storage.save(...args),
  signedUrl: (...args) => storage.signedUrl(...args),
  remove: (...args) => storage.remove(...args),
  setStorageForTests,
};
