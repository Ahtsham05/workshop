const mongoose = require('mongoose');
const app = require('../src/app');
const config = require('../src/config/config');

let isConnected = false;

const ALLOWED_ORIGINS = [
  'https://app.logixplussolutions.com',
  'https://logixplussolutions.com',
  'https://www.logixplussolutions.com',
  process.env.FRONTEND_URL,
].filter(Boolean);

const ALLOWED_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost:\d+$/,
  /^https?:\/\/127\.0\.0\.1:\d+$/,
  /^https?:\/\/([a-z0-9-]+\.)*logixplussolutions\.com$/i,
  /^https?:\/\/[a-z0-9-]+\.vercel\.app$/i,
];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  const normalized = (() => {
    try { return new URL(origin).origin; } catch { return origin.replace(/\/+$/, ''); }
  })();
  return (
    ALLOWED_ORIGINS.includes(normalized) ||
    ALLOWED_ORIGIN_PATTERNS.some((p) => p.test(normalized))
  );
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type,Authorization,X-Requested-With,Cache-Control,Pragma'
    );
    res.setHeader('Access-Control-Max-Age', '86400');
  }
}

async function connectToDatabase() {
  if (isConnected && mongoose.connection.readyState === 1) {
    return;
  }

  if (mongoose.connection.readyState === 0) {
    try {
      await mongoose.connect(config.mongoose.url);
      isConnected = true;
      console.log('MongoDB connected');
    } catch (error) {
      console.error('MongoDB connection error:', error);
      throw error;
    }
  }
}

// Export handler for Vercel serverless
module.exports = async (req, res) => {
  // Handle CORS preflight immediately — before Express processes anything
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    await connectToDatabase();
    return app(req, res);
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
};
