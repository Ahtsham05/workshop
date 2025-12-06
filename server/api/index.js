const mongoose = require('mongoose');
const app = require('./app');
const config = require('./config/config');
const logger = require('./config/logger');

// Connect to MongoDB
if (mongoose.connection.readyState === 0) {
  mongoose.connect(config.mongoose.url, config.mongoose.options)
    .then(() => {
      logger.info('Connected to MongoDB');
    })
    .catch((error) => {
      logger.error('MongoDB connection error:', error);
    });
}

// Export the Express app for Vercel serverless
module.exports = app;
