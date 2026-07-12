const multer = require('multer');

const ALLOWED_PREFIXES = ['image/', 'video/', 'audio/'];
const ALLOWED_EXACT = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];

const fileFilter = (req, file, cb) => {
  const allowed = ALLOWED_PREFIXES.some((p) => file.mimetype.startsWith(p)) || ALLOWED_EXACT.includes(file.mimetype);
  cb(allowed ? null : new Error('Unsupported file type for WhatsApp'), allowed);
};

const whatsappMediaUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 },
});

module.exports = whatsappMediaUpload;
