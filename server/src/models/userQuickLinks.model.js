const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const quickLinkItemSchema = new mongoose.Schema(
  {
    actionKey: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const userQuickLinksSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Array order IS display order. Only actionKey is stored — hydrated against
    // config/quick-link-registry.js at read time so renaming a route/label/icon is a
    // one-line registry edit, never a data migration across every saved doc.
    links: {
      type: [quickLinkItemSchema],
      default: [],
    },
    // False only for a passively auto-seeded doc (defaults applied, never touched by
    // the user). Lets the service tell "not yet customized, safe to reseed" apart from
    // "user explicitly cleared every pin" — both look identical as an empty `links`
    // array otherwise, and without this flag a deliberate clear-to-zero would silently
    // repopulate on the next load.
    hasCustomized: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true, keepTimestampsInJSON: true }
);

userQuickLinksSchema.plugin(toJSON);
userQuickLinksSchema.index({ organizationId: 1, branchId: 1, userId: 1 }, { unique: true });

const UserQuickLinks = mongoose.model('UserQuickLinks', userQuickLinksSchema);

module.exports = UserQuickLinks;
