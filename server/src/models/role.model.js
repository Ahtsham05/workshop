const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');
const { PERMISSION_KEYS, buildAdminPermissions } = require('../config/permission-registry');

const permissionSchemaDefinition = Object.fromEntries(
  PERMISSION_KEYS.map((key) => [key, { type: Boolean, default: false }]),
);

const permissionSchema = new mongoose.Schema(permissionSchemaDefinition, { _id: false });

const roleSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    permissions: {
      type: permissionSchema,
      default: () => ({}),
    },
    isSystemRole: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

roleSchema.plugin(toJSON);
roleSchema.plugin(paginate);

roleSchema.statics.isNameTaken = async function (name, excludeRoleId) {
  const role = await this.findOne({ name, _id: { $ne: excludeRoleId } });
  return !!role;
};

roleSchema.statics.getAdminPermissions = function () {
  return buildAdminPermissions();
};

const Role = mongoose.model('Role', roleSchema);

module.exports = Role;
