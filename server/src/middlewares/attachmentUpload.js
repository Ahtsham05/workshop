const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { Readable } = require('stream');

// Unlike the shared `upload` middleware (middlewares/upload.js), which only accepts
// images, a scanned supplier invoice is just as often a PDF export as a photo — so this
// filter allows both, mirroring whatsappMediaUpload.js's allowlist style.
const ALLOWED_EXACT = ['application/pdf'];

const fileFilter = (req, file, cb) => {
  const allowed = file.mimetype.startsWith('image/') || ALLOWED_EXACT.includes(file.mimetype);
  cb(allowed ? null : new Error('Only image or PDF files are allowed'), allowed);
};

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  // A scanned invoice photo/PDF runs larger than an avatar or product image, hence the
  // higher limit than the shared `upload` middleware's 5MB.
  limits: { fileSize: 10 * 1024 * 1024 },
});

/**
 * Uploads a single attachment buffer to Cloudinary. `resource_type: 'auto'` (rather than
 * the shared uploadToCloudinary's hardcoded 'image') is what lets this same call handle
 * both images and PDFs — mirrors services/whatsapp/media.service.js's identical pattern.
 * @param {Buffer} buffer
 * @param {string} mimetype
 * @param {Object} [options]
 * @returns {Promise<Object>} Cloudinary upload result
 */
const uploadAttachmentToCloudinary = (buffer, mimetype, options = {}) => {
  const isPdf = mimetype === 'application/pdf';
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'auto',
        folder: 'purchase-attachments',
        ...(isPdf ? { format: 'pdf' } : {}),
        ...options,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    const readableStream = new Readable({ read() {} });
    readableStream.push(buffer);
    readableStream.push(null);
    readableStream.pipe(uploadStream);
  });
};

module.exports = { attachmentUpload, uploadAttachmentToCloudinary };
