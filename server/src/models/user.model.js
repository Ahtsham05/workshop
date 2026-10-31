const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const { toJSON, paginate } = require('./plugins');
const { roles } = require('../config/roles');
const { BUSINESS_TYPES, normalizeBusinessType } = require('../config/businessTypes');

const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      validate(value) {
        if (!validator.isEmail(value)) {
          throw new Error('Invalid email');
        }
      },
    },
    password: {
      type: String,
      required: true,
      trim: true,
      minlength: 8,
      validate(value) {
        if (value.length < 8) {
          throw new Error('Password must be at least 8 characters');
        }
        // Allow numeric-only passwords (parent portal: studentUserId + phone)
        if (/^\d+$/.test(value)) return;
        if (!value.match(/\d/) || !value.match(/[a-zA-Z]/)) {
          throw new Error('Password must contain at least one letter and one number');
        }
      },
      private: true, // used by the toJSON plugin
    },
    role: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Role',
      required: false,
    },
    organizationId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Organization',
      default: null,
    },
    businessType: {
      type: String,
      enum: BUSINESS_TYPES,
      default: 'other',
      set: normalizeBusinessType,
    },
    systemRole: {
      type: String,
      enum: ['system_admin', 'superAdmin', 'branchAdmin', 'staff'],
      default: 'staff',
    },
    onboardingComplete: {
      type: Boolean,
      default: false,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    preferredLanguage: {
      type: String,
      enum: ['en', 'ur'],
      default: 'en',
    },
    /** Profile photo shown wherever the logged-in user appears (header, sidebar, audit trails). */
    photo: {
      url: { type: String, trim: true, default: '' },
      publicId: { type: String, trim: true, default: '' },
    },
    /** Team chat "last seen": when this person was last connected to chat on any device. */
    lastSeenAt: { type: Date, default: null },
    /**
     * Per-user appearance choices (table row colours, branch tint strength). Stored on the
     * user rather than the browser so the same eye-comfort setup follows them to every
     * device they log in from.
     */
    uiPreferences: {
      rowScheme: {
        type: String,
        enum: ['default', 'slate', 'sky', 'mint', 'sand', 'lavender', 'rose', 'paper'],
        default: 'default',
      },
      alternateRows: { type: Boolean, default: true },
      branchTint: {
        type: String,
        enum: ['off', 'subtle', 'medium', 'strong'],
        default: 'subtle',
      },
      themeColor: {
        type: String,
        enum: [
          'default', 'graphite', 'stone',
          'navy', 'blue', 'sky', 'cyan',
          'teal', 'emerald', 'green', 'forest', 'lime',
          'yellow', 'amber', 'orange', 'bronze', 'red', 'maroon',
          'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
        ],
        default: 'default',
      },
      /** Arrange dashboard: section and KPI-card order (ids only; empty = standard order). */
      dashboardLayout: {
        sections: { type: [String], default: undefined },
        cards: { type: [String], default: undefined },
      },
      /** New Invoice / New Purchase screens: ids of the toolbar buttons and side cards the person hid. */
      transactionLayout: {
        sale: { type: [String], default: undefined },
        purchase: { type: [String], default: undefined },
      },
      /** Free-choice #rrggbb colours; null = use the theme / default for that surface. */
      customColors: {
        background: { type: String, default: null, match: /^#[0-9a-fA-F]{6}$/ },
        header: { type: String, default: null, match: /^#[0-9a-fA-F]{6}$/ },
        sidebar: { type: String, default: null, match: /^#[0-9a-fA-F]{6}$/ },
        accent: { type: String, default: null, match: /^#[0-9a-fA-F]{6}$/ },
      },
    },
    // School portal links
    linkedTeacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
      default: null,
    },
    linkedStudentIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
    }],
    // school portal role: teacher | parent | student (derived, stored for fast filtering)
    schoolRole: {
      type: String,
      enum: ['schoolAdmin', 'teacher', 'parent', 'student', null],
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// add plugin that converts mongoose to json
userSchema.plugin(toJSON);
userSchema.plugin(paginate);

/**
 * Check if email is taken
 * @param {string} email - The user's email
 * @param {ObjectId} [excludeUserId] - The id of the user to be excluded
 * @returns {Promise<boolean>}
 */
userSchema.statics.isEmailTaken = async function (email, excludeUserId) {
  const user = await this.findOne({ email, _id: { $ne: excludeUserId } });
  return !!user;
};

/**
 * Check if password matches the user's password
 * @param {string} password
 * @returns {Promise<boolean>}
 */
userSchema.methods.isPasswordMatch = async function (password) {
  const user = this;
  return bcrypt.compare(password, user.password);
};

userSchema.pre('save', async function (next) {
  const user = this;
  if (user.isModified('password')) {
    user.password = await bcrypt.hash(user.password, 8);
  }
  next();
});

/**
 * @typedef User
 */
const User = mongoose.model('User', userSchema);

module.exports = User;
