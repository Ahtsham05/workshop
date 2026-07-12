const config = require('../../config/config');
const connectionService = require('./connection.service');
const logger = require('../../config/logger');

async function downloadMediaFromMeta(connection, mediaId) {
  const accessToken = connectionService.getDecryptedToken(connection);
  const metaRes = await fetch(
    `${connectionService.graphBaseUrl(connection.apiVersion)}/${mediaId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const metaBody = await metaRes.json();
  if (!metaBody.url) throw new Error('Media URL not returned from Meta');

  const fileRes = await fetch(metaBody.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!fileRes.ok) throw new Error(`Media download failed (${fileRes.status})`);
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  return { buffer, mimeType: metaBody.mime_type || fileRes.headers.get('content-type') };
}

async function uploadToCloudinary(buffer, mimeType, folder = 'whatsapp') {
  if (!config.cloudinary.cloudName || !config.cloudinary.apiKey) {
    return null;
  }
  const cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
  });

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'auto', format: mimeType?.includes('pdf') ? 'pdf' : undefined },
      (err, result) => {
        if (err) {
          logger.warn('Cloudinary upload failed:', err.message);
          resolve(null);
        } else {
          resolve(result?.secure_url);
        }
      },
    );
    stream.end(buffer);
  });
}

async function persistInboundMedia(connection, mediaId) {
  try {
    const { buffer, mimeType } = await downloadMediaFromMeta(connection, mediaId);
    const url = await uploadToCloudinary(buffer, mimeType);
    return { mediaUrl: url, mediaMimeType: mimeType };
  } catch (err) {
    logger.warn('Failed to persist inbound media:', err.message);
    return { mediaId };
  }
}

module.exports = { downloadMediaFromMeta, persistInboundMedia, uploadToCloudinary };
