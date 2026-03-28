/* eslint-disable no-console */
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const config = require('../config/config');

mongoose
  .connect(config.mongoose.url)
  .then(async () => {
    console.log('Connected to MongoDB');
    const { roleService } = require('../services');
    await roleService.createDefaultRoles();
    const { Role } = require('../models');
    const roles = await Role.find({}, 'name isSystemRole isActive');
    console.log('Default roles seeded successfully:');
    roles.forEach((r) => console.log(` - ${r.name} (systemRole: ${r.isSystemRole})`));
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seeding failed:', err.message);
    process.exit(1);
  });
