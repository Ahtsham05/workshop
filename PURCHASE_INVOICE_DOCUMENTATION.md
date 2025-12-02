# Purchase Invoice System Documentation

## Overview
Complete purchase invoice management system similar to the sales invoice feature, but designed specifically for purchases from suppliers. No type filtering (cash/credit/pending) - all purchases are treated uniformly.

## ✅ What's Been Created

### 1. **API Layer** (`/client/src/stores/purchase.api.ts`)
RTK Query API slice for purchase operations:
- `createPurchase` - Create new purchase
- `getPurchases` - List all purchases with pagination
- `getPurchaseById` - Get single purchase details
- `updatePurchase` - Update existing purchase
- `deletePurchase` - Delete purchase
- `getPurchaseStatistics` - Get purchase stats
- `getPurchasesByDate` - Filter by date range
- `getPurchasesBySupplier` - Filter by supplier

**Store Integration:**
- Registered in `/client/src/stores/store.ts`
- Middleware configured for automatic caching and invalidation

### 2. **Purchase List Component** (`/client/src/features/purchase-invoice/components/purchase-list.tsx`)
Features:
- **Search**: Real-time search with debouncing
- **Filters**: Status filter (completed/pending)
- **Pagination**: Server-side pagination with configurable items per page
- **Actions**: View, Edit, Delete
- **Supplier Display**: Shows supplier name with fallback handling
- **Details View**: Expandable purchase details with item breakdown
- **Delete Confirmation**: Modal dialog before deletion

### 3. **Purchase Panel Component** (`/client/src/features/purchase-invoice/components/purchase-panel.tsx`)
Features:
- **Supplier Selection**: Searchable dropdown with supplier details
- **Purchase Date**: Date picker for purchase date
- **Items Management**: 
  - Add products from catalog
  - Manual product selection
  - Quantity adjustment
  - Price adjustment (purchase price)
  - Remove items
- **Real-time Totals**: Auto-calculated subtotal and total
- **Notes**: Optional purchase notes
- **Save Options**:
  - Save only
  - Save & Print Receipt (80mm)
  - Save & Print A4
- **Edit Mode**: Pre-fills form when editing existing purchase

### 4. **Print Utilities** (`/client/src/utils/purchasePrintUtils.ts`)
Two print formats:
- **Receipt Format (80mm)**: Compact thermal printer format
- **A4 Format**: Full-page professional invoice

Both include:
- Purchase invoice number
- Supplier details
- Purchase date
- Item breakdown (product, quantity, price, total)
- Totals section
- Optional notes
- Footer with timestamp

### 5. **Main Purchase Invoice Page** (`/client/src/features/purchase-invoice/index.tsx`)
Complete purchase management with:
- **View Management**: List → Create/Edit → List
- **Product Catalog Integration**: Reuses invoice product catalog component
- **State Management**: 
  - Products from product slice
  - Suppliers from supplier slice
  - Local purchase state
- **Barcode Support**: Search and add products by barcode
- **Category Filtering**: Group products by category
- **Auto-calculations**: Real-time total updates

## 🎯 Key Differences from Invoice System

### Removed Features:
- ❌ No invoice types (cash/credit/pending)
- ❌ No payment tracking (paid amount, balance, due date)
- ❌ No customer ledger integration
- ❌ No pending conversion functionality
- ❌ No bill number generation
- ❌ No split payment
- ❌ No delivery/service charges
- ❌ No discount

### Purchase-Specific Features:
- ✅ **Purchase Price Tracking**: Each item tracks purchase price (priceAtPurchase)
- ✅ **Supplier Management**: Link purchases to suppliers
- ✅ **Stock Increase**: Backend automatically increases stock on purchase
- ✅ **Simple Status**: Only completed/pending status
- ✅ **Cost Update**: Updates product cost price on purchase

## 📋 Backend Integration

### Existing Backend Endpoints:
```
POST   /v1/purchases              - Create purchase
GET    /v1/purchases              - List purchases (with pagination)
GET    /v1/purchases/:id          - Get purchase by ID
PATCH  /v1/purchases/:id          - Update purchase
DELETE /v1/purchases/:id          - Delete purchase
GET    /v1/purchases/date         - Get purchases by date range
```

### Backend Automatically Handles:
1. **Stock Increase**: Adds quantity to product stock on purchase creation
2. **Stock Adjustment**: Adjusts stock on purchase update
3. **Stock Decrease**: Restores stock on purchase deletion
4. **Invoice Number**: Auto-generates unique invoice number (INV-XXXXXX format)
5. **Price Update**: Updates product purchase price

## 🚀 How to Use

### Creating a Purchase:
1. Navigate to purchase list
2. Click "Create Purchase"
3. Select supplier from dropdown
4. Add products from catalog or manually
5. Adjust quantities and prices
6. Add optional notes
7. Save (with or without printing)

### Editing a Purchase:
1. Find purchase in list
2. Click edit icon
3. Modify items, quantities, or prices
4. Save changes

### Viewing Purchase Details:
1. Click eye icon on any purchase
2. View complete details including all items
3. Return to list with back button

### Printing:
- Receipt format for thermal printers (80mm)
- A4 format for laser/inkjet printers
- Print during save or from list view

## 🔧 Technical Architecture

### Data Flow:
```
User Action → Component → RTK Query → API Endpoint → Backend Service
                ↓
           Local State Update
                ↓
         UI Re-render with New Data
```

### State Management:
- **Global State**: Products, Suppliers (Redux slices)
- **API State**: Purchase data (RTK Query with caching)
- **Local State**: Current purchase form, UI preferences

### Performance Optimizations:
- Debounced search (500ms)
- Automatic cache invalidation
- Pagination for large lists
- Lazy loading of product images
- Memoized calculations

## 📁 File Structure

```
/client/src/
├── stores/
│   └── purchase.api.ts          # RTK Query API
├── features/
│   └── purchase-invoice/
│       ├── index.tsx             # Main page
│       └── components/
│           ├── purchase-list.tsx # List view
│           └── purchase-panel.tsx # Create/Edit form
└── utils/
    └── purchasePrintUtils.ts    # Print templates
```

## 🎨 UI Components Used

From shadcn/ui:
- Button, Card, Input, Label, Textarea
- Select, Popover, Command (searchable dropdowns)
- Table, Badge, Dialog
- Loader2 (loading states)

From lucide-react:
- ArrowLeft, Save, Plus, Trash2, Edit, Eye
- Package, User, Calendar, Receipt, Printer
- Search, Filter, Check, ChevronsUpDown

## 🌍 Internationalization

All text is wrapped with `t()` function for translation support:
- English by default
- RTL support ready
- Translation keys follow invoice system patterns

## 🧪 Testing Recommendations

1. **Create Purchase**: Add items, save, verify stock increase
2. **Edit Purchase**: Modify quantities, verify stock adjustment
3. **Delete Purchase**: Verify stock restoration
4. **Print Receipt**: Test 80mm thermal format
5. **Print A4**: Test full-page format
6. **Search**: Test search functionality
7. **Pagination**: Test with large datasets
8. **Supplier Selection**: Test dropdown with many suppliers

## 📝 Future Enhancements

Potential additions:
- Purchase returns
- Supplier payments
- Purchase orders (before actual purchase)
- Bulk import from CSV
- Purchase analytics/reports
- Multi-currency support
- Purchase approval workflow
- Barcode printing for received items

## ✅ Summary

You now have a complete, professional purchase invoice system that:
- ✅ Matches invoice functionality but for purchases
- ✅ Integrates with existing product/supplier systems
- ✅ Handles stock management automatically
- ✅ Supports printing in multiple formats
- ✅ Provides search, filter, and pagination
- ✅ Includes create, read, update, delete operations
- ✅ Uses modern React patterns (hooks, RTK Query)
- ✅ Follows your existing codebase conventions
- ✅ No type filtering (simpler than invoice system)

The system is ready to use! Just navigate to the purchase invoice route in your app.
