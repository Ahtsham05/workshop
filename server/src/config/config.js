const dotenv = require('dotenv');
const path = require('path');
const Joi = require('joi');

dotenv.config({ path: path.join(__dirname, '../../.env') });

function normalizeMongoUrl(value) {
  if (typeof value !== 'string') {
    return value;
  }

  // Vercel env values are occasionally pasted with wrapping quotes or spaces.
  return value.trim().replace(/^['\"]|['\"]$/g, '');
}

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
  })
  .unknown();

const { value: envVars, error } = envVarsSchema.prefs({ errors: { label: 'key' } }).validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

const normalizedMongoUrl = normalizeMongoUrl(envVars.MONGODB_URL);
if (!/^mongodb(\+srv)?:\/\//i.test(normalizedMongoUrl || '')) {
  throw new Error(
    'Config validation error: MONGODB_URL must start with mongodb:// or mongodb+srv://'
  );
}

module.exports = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  mongoose: {
    url: normalizedMongoUrl + (envVars.NODE_ENV === 'test' ? '-test' : ''),
    options: {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      heartbeatFrequencyMS: 10000,  // ping Atlas every 10s to keep connections alive
      maxPoolSize: 10,
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
};
