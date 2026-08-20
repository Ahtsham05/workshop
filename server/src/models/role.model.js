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
    /** null for system roles (global templates). Required for every custom role. */
    organizationId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Organization',
      default: null,
    },
    /** null = role is usable at every branch in the org. Set = role only applies at that one branch. */
    branchId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Branch',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

roleSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { isSystemRole: true }, name: 'system_role_name_unique' }
);
roleSchema.index(
  { organizationId: 1, branchId: 1, name: 1 },
  { unique: true, partialFilterExpression: { isSystemRole: false }, name: 'org_branch_role_name_unique' }
);
roleSchema.index({ organizationId: 1, branchId: 1 });

roleSchema.plugin(toJSON);
roleSchema.plugin(paginate);

/**
 * @param {string} name
 * @param {{isSystemRole?: boolean, organizationId?: string, branchId?: string|null}} [scope]
 * @param {string} [excludeRoleId]
 */
roleSchema.statics.isNameTaken = async function (name, scope = {}, excludeRoleId) {
  const query = scope.isSystemRole
    ? { name, isSystemRole: true, _id: { $ne: excludeRoleId } }
    : {
        name,
        isSystemRole: false,
        organizationId: scope.organizationId,
        branchId: scope.branchId ?? null,
        _id: { $ne: excludeRoleId },
      };
  const role = await this.findOne(query);
  return !!role;
};

roleSchema.statics.getAdminPermissions = function () {
  return buildAdminPermissions();
};

const Role = mongoose.model('Role', roleSchema);

module.exports = Role;
