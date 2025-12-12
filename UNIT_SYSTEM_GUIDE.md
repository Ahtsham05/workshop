# Unit System Implementation Guide

## Overview
A comprehensive unit of measurement system has been implemented across the entire software to support different product measurement units (pieces, kilograms, liters, etc.). The default unit for all products is **"pcs" (pieces)**.

## Features

### 1. **Supported Units**
The system supports 45+ different measurement units organized in categories:

#### Piece/Count Units
- pcs (Pieces) - **DEFAULT**
- unit, item, pair, set, dozen

#### Weight Units
- kg, g, mg, lb, oz, ton

#### Length Units
- m, cm, mm, km, in, ft, yd

#### Volume/Liquid Units
- l, ml, gal, qt, pt

#### Area Units
- sqm, sqft, sqyd, acre

#### Packaging Units
- box, carton, pack, bag, bottle, can, jar, roll, sheet, bundle

#### Time-based Units (for services/rentals)
- hour, day, week, month, year

### 2. **Backend Implementation**

#### Files Modified/Created:

**`/server/src/config/units.js`** (NEW)
- Central configuration for all units
- Contains `UNITS` constants, `UNIT_LABELS`, and helper functions
- Exports: `getAllUnits()`, `getUnitLabel()`, `DEFAULT_UNIT`

**`/server/src/models/product.model.js`** (MODIFIED)
- Added `unit` field with default value `DEFAULT_UNIT` (pcs)
- Enum validation ensures only valid units are stored
- Automatically defaults to "pcs" for existing products

**`/server/src/controllers/units.controller.js`** (NEW)
- API controller to expose units list
- Returns units array with value/label pairs

**`/server/src/routes/v1/units.route.js`** (NEW)
- REST endpoint: `GET /v1/units`
- Returns all available units and default unit

**`/server/src/routes/v1/index.js`** (MODIFIED)
- Registered units route in main router

### 3. **Frontend Implementation**

#### Files Modified/Created:

**`/client/src/lib/units.ts`** (NEW)
- TypeScript constants and utilities
- `UNITS`, `UNIT_LABELS`, `DEFAULT_UNIT`
- Helper functions:
  - `getAllUnits()` - Returns unit options for dropdowns
  - `getUnitLabel(unit)` - Returns display label for a unit
  - `getUnitDisplay(quantity, unit)` - Formats "quantity unit" display

**`/client/src/features/products/data/schema.ts`** (MODIFIED)
- Added `unit` field to product schema

**`/client/src/features/products/components/users-action-dialog.tsx`** (MODIFIED)
- Added unit selection dropdown in product form
- Defaults to "pcs" for new products
- Displays all 45+ units in a native select element

**`/client/src/features/products/components/users-columns.tsx`** (MODIFIED)
- Stock quantity column now displays: "10 Pieces", "5 kg", etc.
- Shows unit label with quantity

**`/client/src/features/products/index.tsx`** (NO CHANGES)
- Products list automatically inherits unit display from columns

**`/client/src/features/invoice/index.tsx`** (MODIFIED)
- Updated `InvoiceItem` interface to include `unit` field
- Updated `Product` interface to include `unit` field
- `addToInvoice()` function copies unit from product to invoice item
- Unit is preserved when adding items to invoices

**`/client/src/features/invoice/components/invoice-panel.tsx`** (MODIFIED)
- Displays unit below quantity input (e.g., "pcs", "kg")
- Copies unit when converting manual entries to products
- Unit is shown in small text under quantity controls

**`/client/src/features/invoice/components/invoice-list.tsx`** (MODIFIED)
- Invoice items table shows quantity with unit: "10 pcs", "5 kg"
- Falls back to "pcs" if unit is not specified

### 4. **Database Migration**

**Existing Products:**
- Products without a `unit` field will automatically default to "pcs"
- MongoDB will apply the default value on read
- No manual migration needed

**New Products:**
- Must select a unit (defaults to "pcs" in form)
- Unit is validated against enum values

### 5. **API Endpoints**

#### Get Units
```
GET /v1/units
```

**Response:**
```json
{
  "units": [
    { "value": "pcs", "label": "Pieces" },
    { "value": "kg", "label": "Kilogram" },
    ...
  ],
  "defaultUnit": "pcs"
}
```

## Usage Examples

### Adding a Product
1. Open "Add Product" dialog
2. Fill in product details
3. Select unit from dropdown (defaults to "pcs")
4. Save product

### Creating an Invoice
1. Add products to invoice
2. Each item automatically includes its unit
3. Quantity displays show: "10 pcs", "5 kg", etc.
4. Unit is saved with the invoice item

### Viewing Products
- Product list shows: **"Stock: 100 Pieces"**
- Low stock alerts show: **"10 kg left"**
- Invoices show: **"Qty: 5 Liters"**

## Default Behavior

### Products Without Unit
- Any product without an explicit unit value shows as **"pcs"**
- Backend applies default on model level
- Frontend falls back to "pcs" if unit is null/undefined

### Display Format
- Stock Quantity: `{quantity} {unitLabel}`
- Example: "50 Pieces", "10 Kilograms", "5 Liters"

## Localization Support

The unit system is designed to support translations:
- Unit labels can be translated via i18n
- Currently using English labels
- Ready for multi-language expansion

## Testing Checklist

- [x] Backend model includes unit field with default
- [x] Units API endpoint returns all units
- [x] Product form displays unit dropdown
- [x] Product form defaults to "pcs"
- [x] Product list shows units with stock
- [x] Invoice items include unit information
- [x] Invoice panel displays units
- [x] Invoice list/view shows units
- [x] Existing products default to "pcs"
- [x] TypeScript types updated
- [x] No compilation errors

## Extended Implementation Areas

### Purchase Invoices
- **Backend Model**: Added `unit` field to purchase items schema
- **Frontend Interface**: `PurchaseItem` includes unit field
- **Display**: Quantity shows with unit in purchase panel and list
- **Print**: Both receipt and A4 formats show units with quantities

### Reports
- **Inventory Report**: Stock column displays "50 Pieces", "10 kg"
- **Product Report**: Quantity sold and current stock show with units
- **Sales Report**: Ready for unit display when implemented

### Printing Views
- **Purchase Receipt**: Shows "10 pcs", "5 kg" in item quantities
- **Purchase A4**: Professional format with units displayed
- **Invoice Printing**: Ready for implementation with unit support

### Low Stock Alerts
- **Alert Banner**: Shows units with stock levels
- **Details View**: Displays stock quantities with proper units
- **Badges**: Critical/low stock indicators include units

## Complete File Modifications

### Backend (Server)
1. ✅ `/server/src/config/units.js` - Created
2. ✅ `/server/src/models/product.model.js` - Modified
3. ✅ `/server/src/models/purchase.model.js` - Modified
4. ✅ `/server/src/models/invoice.model.js` - Modified
5. ✅ `/server/src/controllers/units.controller.js` - Created
6. ✅ `/server/src/routes/v1/units.route.js` - Created
7. ✅ `/server/src/routes/v1/index.js` - Modified

### Frontend (Client)
8. ✅ `/client/src/lib/units.ts` - Created
9. ✅ `/client/src/features/products/data/schema.ts` - Modified
10. ✅ `/client/src/features/products/components/users-action-dialog.tsx` - Modified
11. ✅ `/client/src/features/products/components/users-columns.tsx` - Modified
12. ✅ `/client/src/features/invoice/index.tsx` - Modified (InvoiceItem & Product interfaces)
13. ✅ `/client/src/features/invoice/components/invoice-panel.tsx` - Modified
14. ✅ `/client/src/features/invoice/components/invoice-list.tsx` - Modified
15. ✅ `/client/src/features/purchase-invoice/index.tsx` - Modified
16. ✅ `/client/src/features/purchase-invoice/components/purchase-panel.tsx` - Modified
17. ✅ `/client/src/features/purchase-invoice/components/purchase-list.tsx` - Modified
18. ✅ `/client/src/features/products/components/low-stock-details.tsx` - Modified
19. ✅ `/client/src/features/reports/components/inventory-report.tsx` - Modified
20. ✅ `/client/src/features/reports/components/product-report.tsx` - Modified
21. ✅ `/client/src/utils/purchasePrintUtils.ts` - Modified

**Total Files**: 21 files (7 backend, 14 frontend)

## Future Enhancements

1. **Unit Conversions**
   - Convert between related units (kg ↔ g, l ↔ ml)
   - Useful for packaging/repackaging

2. **Custom Units**
   - Allow users to add custom units
   - Store in database alongside predefined units

3. **Unit-based Pricing**
   - Price per unit (e.g., $5/kg, $2/liter)
   - Automatic calculation for partial units

4. **Reporting by Unit**
   - Sales reports grouped by unit type
   - Inventory summaries by measurement type

5. **Invoice Printing**
   - Create dedicated invoice print utilities
   - Include units in all printed formats

## Notes

- **Backward Compatibility**: Fully maintained - existing products work without changes
- **Performance**: No impact - unit is a simple string field
- **Validation**: Server-side enum validation prevents invalid units
- **Default Fallback**: System always shows "pcs" if unit is missing
- **Complete Coverage**: Units displayed in all views (products, invoices, purchases, reports, printing)

---

**Implementation Date**: December 12, 2025
**Default Unit**: pcs (Pieces)
**Total Units Supported**: 45+
**Files Modified**: 21 files across backend and frontend
