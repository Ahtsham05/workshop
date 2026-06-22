const dotenv = require('dotenv');
const path = require('path');
const Joi = require('joi');

const envPath = process.env.ENV_FILE || path.join(__dirname, '../../.env');
dotenv.config({ path: envPath });

const envVarsSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string().valid('production', 'development', 'test').required(),
    PORT: Joi.number().default(3000),
    MONGODB_URL: Joi.string().required().description('Mongo DB url'),
    JWT_SECRET: Joi.string().required().description('JWT secret key'),
    JWT_ACCESS_EXPIRATION_MINUTES: Joi.number().default(30).description('minutes after which access tokens expire'),
    JWT_REFRESH_EXPIRATION_DAYS: Joi.number().default(30).description('days after which refresh tokens expire'),
    JWT_RESET_PASSWORD_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description('minutes after which reset password token expires'),
    JWT_VERIFY_EMAIL_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description('minutes after which verify email token expires'),
    SMTP_HOST: Joi.string().description('server that will send the emails'),
    SMTP_PORT: Joi.number().description('port to connect to the email server'),
    SMTP_USERNAME: Joi.string().description('username for email server'),
    SMTP_PASSWORD: Joi.string().description('password for email server'),
    EMAIL_FROM: Joi.string().description('the from field in the emails sent by the app'),
    CLOUDINARY_CLOUD_NAME: Joi.string().description('Cloudinary cloud name'),
    CLOUDINARY_API_KEY: Joi.string().description('Cloudinary API key'),
    CLOUDINARY_API_SECRET: Joi.string().description('Cloudinary API secret'),
    PEXELS_API_KEY: Joi.string().allow('').description('Pexels API key for product/category image search'),
    GEMINI_API_KEY: Joi.string().allow('').description('Google Gemini API key for customer image AI scan'),
    GEMINI_VISION_MODEL: Joi.string().allow('').description('Gemini vision model (default gemini-2.5-flash-lite, API v1)'),
    GEMINI_FALLBACK_MODELS: Joi.string().allow('').description('Comma-separated fallback models if quota hit'),
    WHATSAPP_PROVIDER: Joi.string().valid('auto', 'cloud', 'web').default('auto'),
    WHATSAPP_CLOUD_ACCESS_TOKEN: Joi.string().allow('').description('Meta WhatsApp Cloud API permanent access token'),
    WHATSAPP_CLOUD_PHONE_NUMBER_ID: Joi.string().allow('').description('WhatsApp Cloud API phone number ID'),
    WHATSAPP_CLOUD_API_VERSION: Joi.string().allow('').default('v21.0'),
    WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID: Joi.string().allow('').description('Optional WABA ID'),
    META_APP_ID: Joi.string().allow('').description('Meta App ID for Embedded Signup'),
    META_APP_SECRET: Joi.string().allow('').description('Meta App Secret'),
    META_EMBEDDED_SIGNUP_CONFIG_ID: Joi.string().allow('').description('Embedded Signup Configuration ID'),
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: Joi.string().allow('').description('Meta webhook verify token'),
    WHATSAPP_WEBHOOK_SECRET: Joi.string().allow('').description('Meta webhook app secret for signature verification'),
    BACKEND_PUBLIC_URL: Joi.string().allow('').description('Public backend URL for OAuth callbacks'),
    FRONTEND_URL: Joi.string().allow('').description('Frontend URL for post-OAuth redirect'),
    VAPID_PUBLIC_KEY: Joi.string().allow('').description('Web Push VAPID public key'),
    VAPID_PRIVATE_KEY: Joi.string().allow('').description('Web Push VAPID private key'),
    VAPID_SUBJECT: Joi.string().allow('').description('Web Push VAPID subject (mailto: or https:)'),
  })
  .unknown();

const { value: envVars, error } = envVarsSchema.prefs({ errors: { label: 'key' } }).validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

module.exports = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  mongoose: {
    url: envVars.MONGODB_URL + (envVars.NODE_ENV === 'test' ? '-test' : ''),
    options: {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      heartbeatFrequencyMS: 10000,  // ping Atlas every 10s to keep connections alive
      maxPoolSize: 20, // headroom for concurrent aggregation-heavy endpoints (purchase suggestions, dashboard stats) — was 10, too easy to saturate and stall unrelated requests
      minPoolSize: 2,               // keep 2 connections warm to avoid cold reconnects
      retryWrites: true,
      retryReads: true,
      connectTimeoutMS: 10000,
    },
  },
  jwt: {
    secret: envVars.JWT_SECRET,
    accessExpirationMinutes: envVars.JWT_ACCESS_EXPIRATION_MINUTES,
    refreshExpirationDays: envVars.JWT_REFRESH_EXPIRATION_DAYS,
    resetPasswordExpirationMinutes: envVars.JWT_RESET_PASSWORD_EXPIRATION_MINUTES,
    verifyEmailExpirationMinutes: envVars.JWT_VERIFY_EMAIL_EXPIRATION_MINUTES,
  },
  email: {
    smtp: {
      host: envVars.SMTP_HOST,
      port: envVars.SMTP_PORT,
      auth: {
        user: envVars.SMTP_USERNAME,
        pass: envVars.SMTP_PASSWORD,
      },
    },
    from: envVars.EMAIL_FROM,
  },
  cloudinary: {
    cloudName: envVars.CLOUDINARY_CLOUD_NAME,
    apiKey: envVars.CLOUDINARY_API_KEY,
    apiSecret: envVars.CLOUDINARY_API_SECRET,
  },
  pexels: {
    apiKey: envVars.PEXELS_API_KEY || '',
  },
  gemini: {
    apiKey: envVars.GEMINI_API_KEY || '',
    model: envVars.GEMINI_VISION_MODEL || 'gemini-2.5-flash-lite',
    fallbackModels: envVars.GEMINI_FALLBACK_MODELS || '',
  },
  whatsapp: {
    provider: envVars.WHATSAPP_PROVIDER || 'auto',
    cloud: {
      provider: envVars.WHATSAPP_PROVIDER || 'auto',
      accessToken: (envVars.WHATSAPP_CLOUD_ACCESS_TOKEN || '').trim(),
      phoneNumberId: (envVars.WHATSAPP_CLOUD_PHONE_NUMBER_ID || '').trim(),
      apiVersion: (envVars.WHATSAPP_CLOUD_API_VERSION || 'v21.0').trim(),
      businessAccountId: (envVars.WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID || '').trim(),
    },
    meta: {
      appId: (envVars.META_APP_ID || '').trim(),
      appSecret: (envVars.META_APP_SECRET || '').trim(),
      embeddedSignupConfigId: (envVars.META_EMBEDDED_SIGNUP_CONFIG_ID || '').trim(),
    },
    webhookVerifyToken: (envVars.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '').trim(),
    webhookSecret: (envVars.WHATSAPP_WEBHOOK_SECRET || envVars.META_APP_SECRET || '').trim(),
    backendPublicUrl: (envVars.BACKEND_PUBLIC_URL || '').trim(),
    frontendUrl: (envVars.FRONTEND_URL || '').trim(),
  },
  vapid: {
    publicKey: (envVars.VAPID_PUBLIC_KEY || '').trim(),
    privateKey: (envVars.VAPID_PRIVATE_KEY || '').trim(),
    subject: (envVars.VAPID_SUBJECT || 'mailto:support@logixplus.com').trim(),
  },
};
