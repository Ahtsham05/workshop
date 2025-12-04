# Accounting System Implementation Guide

## Overview
A complete accounting system with expense management, customer ledger, and supplier ledger functionality.

## Backend Setup (✅ COMPLETED)

### Models Created:
1. **Expense Model** (`/server/src/models/expense.model.js`)
   - Expense tracking with categories
   - Auto-generated expense numbers
   - Payment method tracking
   - File attachments support

2. **CustomerLedger Model** (`/server/src/models/customerLedger.model.js`)
   - Transaction tracking with debit/credit
   - Running balance calculation
   - Reference to invoices/payments

3. **SupplierLedger Model** (`/server/src/models/supplierLedger.model.js`)
   - Purchase and payment tracking
   - Automatic balance updates

### Services Created:
- `expense.service.js` - CRUD operations + summary/trends
- `customerLedger.service.js` - Ledger operations + balance queries
- `supplierLedger.service.js` - Supplier ledger management

### Controllers & Routes:
- `/api/v1/expenses` - Full CRUD + analytics
- `/api/v1/customer-ledger` - Customer transactions
- `/api/v1/supplier-ledger` - Supplier transactions

### Permissions Added:
- `getExpenses`, `manageExpenses`
- `getLedgers`, `manageLedgers`

## Frontend Structure

```
client/src/features/accounting/
├── index.tsx                          # Main accounting page with tabs
├── components/
│   ├── accounts-dashboard.tsx         # Overview dashboard
│   ├── expense-management.tsx         # Expense CRUD
│   ├── expense-form.tsx               # Create/edit expense form
│   ├── expense-list.tsx               # Expense table with filters
│   ├── customer-ledger.tsx            # Customer ledger view
│   ├── customer-ledger-list.tsx       # Customer list with balances
│   ├── customer-ledger-details.tsx    # Individual customer transactions
│   ├── ledger-entry-form.tsx          # Add ledger entry
│   ├── supplier-ledger.tsx            # Supplier ledger view
│   ├── supplier-ledger-list.tsx       # Supplier list with balances
│   └── supplier-ledger-details.tsx    # Individual supplier transactions
```

## API Endpoints

### Expenses
```typescript
GET    /api/v1/expenses                 // List expenses (paginated, filtered)
POST   /api/v1/expenses                 // Create expense
GET    /api/v1/expenses/:id             // Get expense details
PATCH  /api/v1/expenses/:id             // Update expense
DELETE /api/v1/expenses/:id             // Delete expense
GET    /api/v1/expenses/summary         // Category summary
GET    /api/v1/expenses/trends          // Monthly trends
```

### Customer Ledger
```typescript
GET    /api/v1/customer-ledger                           // List entries
POST   /api/v1/customer-ledger                           // Create entry
GET    /api/v1/customer-ledger/:id                       // Get entry
PATCH  /api/v1/customer-ledger/:id                       // Update entry
DELETE /api/v1/customer-ledger/:id                       // Delete entry
GET    /api/v1/customer-ledger/customer/:id/balance      // Get balance
GET    /api/v1/customer-ledger/customer/:id/summary      // Get summary
GET    /api/v1/customer-ledger/customers-with-balances   // All customers
```

### Supplier Ledger
```typescript
GET    /api/v1/supplier-ledger                           // List entries
POST   /api/v1/supplier-ledger                           // Create entry
GET    /api/v1/supplier-ledger/:id                       // Get entry
PATCH  /api/v1/supplier-ledger/:id                       // Update entry
DELETE /api/v1/supplier-ledger/:id                       // Delete entry
GET    /api/v1/supplier-ledger/supplier/:id/balance      // Get balance
GET    /api/v1/supplier-ledger/supplier/:id/summary      // Get summary
GET    /api/v1/supplier-ledger/suppliers-with-balances   // All suppliers
```

## Features

### 1. Accounts Dashboard
- **Summary Cards:**
  - Total Expenses (monthly)
  - Total Receivables (from customers)
  - Total Payables (to suppliers)
  - Net Cash Flow
  
- **Charts:**
  - Expense trends by category (pie chart)
  - Monthly expense trends (line chart)
  - Top customers by balance
  - Top suppliers by balance

### 2. Expense Management
- **List View:**
  - Filterable table (category, date range, payment method)
  - Search functionality
  - Export to CSV/PDF
  
- **Create/Edit:**
  - Category selection (Rent, Utilities, Salaries, etc.)
  - Amount input
  - Payment method
  - Vendor name
  - Date picker
  - Notes/description
  - File attachments

### 3. Customer Ledger
- **Customer List:**
  - Shows all customers with current balances
  - Color coding (red for overdue, green for credits)
  - Quick actions (view ledger, add payment)
  
- **Ledger Details:**
  - Transaction history table
  - Running balance
  - Filter by date range
  - Add manual entries (adjustments, opening balance)
  - Payment recording

### 4. Supplier Ledger
- **Supplier List:**
  - Shows all suppliers with balances owed
  - Payment status indicators
  - Quick payment option
  
- **Ledger Details:**
  - Purchase history
  - Payment history
  - Outstanding balance
  - Payment due tracking

## Data Flow

### Automatic Ledger Updates:
1. **Invoice Created** → Customer Ledger Entry (Debit)
2. **Payment Received** → Customer Ledger Entry (Credit)
3. **Purchase Created** → Supplier Ledger Entry (Credit)
4. **Payment Made** → Supplier Ledger Entry (Debit)

### Balance Calculation:
- **Customer Balance** = Total Debits - Total Credits
  - Positive = Customer owes you
  - Negative = You owe customer (credit)
  
- **Supplier Balance** = Total Credits - Total Debits
  - Positive = You owe supplier
  - Negative = Supplier owes you

## UI Components Needed

### shadcn/ui Components:
- Card, Button, Input, Label
- Table, Tabs, Dialog, Select
- DatePicker, Badge, Separator
- Chart components (recharts)

### Custom Components:
- StatCard - Display metrics
- ExpenseCard - Expense item display
- LedgerTable - Transaction table with balance column
- PaymentForm - Record payments
- DateRangeFilter - Filter by date range

## Next Steps

1. ✅ Backend models, services, controllers, routes created
2. ✅ API endpoints configured
3. ✅ Permissions added to roles
4. ⏳ Frontend components (in progress)
5. ⏳ Redux slices for state management
6. ⏳ UI integration and testing

## Testing Checklist

### Expenses:
- [ ] Create expense
- [ ] View expense list with filters
- [ ] Update expense
- [ ] Delete expense
- [ ] View expense summary by category
- [ ] Export expenses

### Customer Ledger:
- [ ] Auto-create entry on invoice
- [ ] Record payment received
- [ ] View customer balance
- [ ] View transaction history
- [ ] Add manual adjustment
- [ ] View all customers with balances

### Supplier Ledger:
- [ ] Auto-create entry on purchase
- [ ] Record payment made
- [ ] View supplier balance
- [ ] View transaction history
- [ ] Add manual adjustment
- [ ] View all suppliers with balances

## Database Indexes
Already added for performance:
- Customer ledger: `{ customer: 1, transactionDate: -1 }`
- Supplier ledger: `{ supplier: 1, transactionDate: -1 }`

## Security Considerations
- Role-based access control implemented
- Audit trail maintained (createdAt, updatedAt)
- Balance recalculation on entry deletion
- Transaction type validation
