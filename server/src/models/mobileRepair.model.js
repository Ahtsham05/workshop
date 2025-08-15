const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

const MobileRepairSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String },
  mobileModel: { type: String },
  mobileFault: { type: String },
  totalAmount: { type: Number },
  advance: { type: Number },
}, {
  timestamps: true,
});

// Plugins for JSON conversion and pagination
MobileRepairSchema.plugin(toJSON);
MobileRepairSchema.plugin(paginate);

const MobileRepair = mongoose.model('MobileRepair', MobileRepairSchema);

module.exports = MobileRepair;
