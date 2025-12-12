const mongoose = require('mongoose');
const config = require('../config/config');
const logger = require('../config/logger');
const { roleService } = require('../services');

const initializeRoles = async () => {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('Connected to MongoDB');

    // Create default roles
    await roleService.createDefaultRoles();
    logger.info('Default roles created successfully');

    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    logger.error('Error initializing roles:', error);
    process.exit(1);
  }
};

initializeRoles();
