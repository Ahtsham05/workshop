# Low Stock Alert System Documentation

## Overview
A comprehensive low stock alert system that helps track inventory levels and notify users when products need restocking.

## Features

### 1. **Low Stock Alert Banner** (`low-stock-alert.tsx`)
- Displays at the top of the products page
- Shows summary statistics:
  - Out of Stock products (0 quantity)
  - Critical Stock products (≤ 50% of threshold)
  - Low Stock products (≤ threshold)
- Color-coded alerts:
  - Red: Out of Stock
  - Orange: Critical Stock
  - Yellow: Low Stock
- Configurable settings:
  - Set custom low stock threshold
  - Enable/disable alerts
  - Settings saved to localStorage

### 2. **Detailed Low Stock View** (`low-stock-details.tsx`)
- Full-page detailed view of all low stock products
- Features:
  - Search by product name or barcode
  - Filter by status (All, Out of Stock, Critical, Low)
  - Export to CSV functionality
  - Sortable table with all product details
  - Summary cards showing counts for each category

### 3. **Integration** (`index.tsx`)
- Alert banner displayed on main products page
- Click banner to view detailed low stock page
- Threshold setting persists across sessions
- Seamless navigation between views

## Configuration

### Default Settings
- **Low Stock Threshold**: 10 units (configurable)
- **Critical Stock**: 50% of threshold (e.g., 5 units if threshold is 10)
- **Alerts**: Enabled by default

### Customization
Users can:
1. Click the settings icon in the alert banner
2. Set custom threshold value
3. Enable/disable notifications
4. Settings are saved to localStorage

## Alert Levels

### Out of Stock (Red Alert)
- Products with 0 quantity
- Highest priority - immediate restocking needed

### Critical Stock (Orange Alert)
- Products with quantity ≤ 50% of threshold
- High priority - restocking needed soon

### Low Stock (Yellow Alert)
- Products with quantity ≤ threshold but > 50% of threshold
- Medium priority - monitor and plan restocking

## Translation Support
Full bilingual support:
- English
- Urdu (اردو)

All UI text, alerts, and messages are fully translated.

## Usage

### For Users
1. **View Alert**: Check the banner at the top of products page
2. **Click for Details**: Click the alert banner to see full details
3. **Search & Filter**: Use search and filters to find specific products
4. **Export Data**: Export low stock report as CSV
5. **Configure**: Adjust threshold and settings as needed

### For Developers
```typescript
// Import components
import { LowStockAlert } from './components/low-stock-alert';
import { LowStockDetails } from './components/low-stock-details';

// Use in products page
<LowStockAlert 
  products={products} 
  defaultThreshold={10} 
/>

<LowStockDetails 
  products={products}
  onBack={() => setShowDetails(false)}
  threshold={threshold}
/>
```

## Technical Details

### State Management
- Uses React hooks (useState, useMemo, useEffect)
- localStorage for persistent settings
- Automatic calculation of stock levels

### Performance
- useMemo for expensive calculations
- Efficient filtering and sorting
- Optimized re-renders

### Data Flow
```
Products Data → Low Stock Alert Component
                ↓
          Calculate Stock Levels
                ↓
    Out of Stock | Critical | Low Stock
                ↓
         Display Alerts
                ↓
   User Clicks → Show Detailed View
```

## Files Created/Modified

### New Files
1. `/client/src/features/products/components/low-stock-alert.tsx`
2. `/client/src/features/products/components/low-stock-details.tsx`

### Modified Files
1. `/client/src/features/products/index.tsx`
   - Added imports
   - Added state management
   - Integrated alert banner
   - Added detailed view routing

2. `/client/src/context/language-context.tsx`
   - Added 40+ new translation keys
   - Both English and Urdu translations

## Future Enhancements (Optional)
1. Email/SMS notifications when products go out of stock
2. Automatic purchase order creation
3. Historical stock level tracking
4. Predictive restocking based on sales trends
5. Integration with supplier management
6. Barcode scanning for quick stock updates
7. Dashboard widget showing stock health
8. Mobile push notifications
9. Custom threshold per product
10. Bulk threshold updates

## Benefits
- **Prevent Stockouts**: Never run out of popular products
- **Better Inventory Management**: Know what to reorder and when
- **Time Saving**: Quick overview of stock status
- **Data Export**: Share reports with team or suppliers
- **Customizable**: Adjust thresholds to fit business needs
- **User-Friendly**: Intuitive interface with clear visual indicators
