const mongoose = require('mongoose');
const config = require('../config/config');
const logger = require('../config/logger');
const { User, Role } = require('../models');

const assignRolesToUsers = async () => {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('Connected to MongoDB');

    // Find the Admin role
    const adminRole = await Role.findOne({ name: 'Admin' });
    
    if (!adminRole) {
      logger.error('Admin role not found. Please run initRoles.js first.');
      process.exit(1);
    }

    // Find all users without a role assigned
    const usersWithoutRole = await User.find({ 
      $or: [
        { role: { $exists: false } },
        { role: null }
      ]
    });

    if (usersWithoutRole.length === 0) {
      logger.info('All users already have roles assigned');
    } else {
      // Assign Admin role to all users without a role
      const result = await User.updateMany(
        { 
          $or: [
            { role: { $exists: false } },
            { role: null }
          ]
        },
        { role: adminRole._id }
      );

      logger.info(`Assigned Admin role to ${result.modifiedCount} users`);
    }

    // Log summary
    const totalUsers = await User.countDocuments();
    const usersWithRoles = await User.countDocuments({ role: { $exists: true, $ne: null } });
    
    logger.info(`Summary: ${usersWithRoles}/${totalUsers} users have roles assigned`);

    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    logger.error('Error assigning roles to users:', error);
    process.exit(1);
  }
};

assignRolesToUsers();
