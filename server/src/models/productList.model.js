const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

/**
 * A named list of products in one branch — "To order", "Do not order", "Online", "High
 * value", or anything the shop makes up. Two kinds:
 *  - manual: the products someone put on it (`items`)
 *  - smart:  a rule evaluated live every time it's opened (`rule`) — e.g. the 50 products
 *            holding the most stock value — so it never goes stale.
 *
 * `purpose` gives a list behaviour elsewhere: 'to_order' lists can be turned into a
 * purchase, products on a 'do_not_order' list warn when added to a purchase.
 */
const PURPOSES = ['custom', 'to_order', 'do_not_order', 'online', 'high_value'];
const RULE_TYPES = ['top_stock_value', 'top_price', 'low_stock', 'out_of_stock', 'inactive_with_stock'];

const ProductListSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, default: '', maxlength: 500 },
    purpose: { type: String, enum: PURPOSES, default: 'custom' },
    color: { type: String, trim: true, default: null },
    kind: { type: String, enum: ['manual', 'smart'], default: 'manual' },
    rule: {
      type: new mongoose.Schema(
        {
          type: { type: String, enum: RULE_TYPES, required: true },
          // How many products a "top" rule keeps.
          limit: { type: Number, min: 1, max: 1000, default: 50 },
          // low_stock: at or below this quantity (else each product's own low-stock level).
          threshold: { type: Number, min: 0, default: null },
          // Optional category scope (a Category _id) for any rule.
          categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
        },
        { _id: false }
      ),
      default: null,
    },
    items: {
      type: [
        new mongoose.Schema(
          {
            productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
            // For a 'to_order' list: how many to order (null = work it out at order time).
            quantity: { type: Number, min: 0, default: null },
            note: { type: String, trim: true, default: '', maxlength: 300 },
            addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
            addedAt: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    pinned: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, keepTimestampsInJSON: true }
);

ProductListSchema.index({ organizationId: 1, branchId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
ProductListSchema.index({ organizationId: 1, branchId: 1, 'items.productId': 1 });

ProductListSchema.plugin(toJSON);

const ProductList = mongoose.model('ProductList', ProductListSchema);

module.exports = ProductList;
module.exports.PURPOSES = PURPOSES;
module.exports.RULE_TYPES = RULE_TYPES;
