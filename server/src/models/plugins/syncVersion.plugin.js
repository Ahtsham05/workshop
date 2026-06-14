const mongoose = require('mongoose');

/**
 * Adds optimistic-concurrency fields for desktop sync conflict detection.
 */
function syncVersionPlugin(schema) {
  schema.add({
    syncVersion: {
      type: Number,
      default: 1,
      min: 1,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  });

  schema.pre('save', function incrementSyncVersion(next) {
    if (!this.isNew && this.isModified() && !this.isModified('syncVersion')) {
      this.syncVersion = (this.syncVersion || 1) + 1;
    }
    next();
  });
}

module.exports = syncVersionPlugin;
