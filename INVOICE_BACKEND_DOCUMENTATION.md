# Invoice Backend API Documentation

## Overview

A complete backend system has been created to handle invoice management for your POS system. The backend provides comprehensive invoice functionality including creation, updates, payment processing, and reporting.

## Backend Structure

### 1. Database Model (`/server/src/models/invoice.model.js`)

The invoice model includes:

- **Invoice Items**: Product details, quantities, prices, and profit calculations
- **Customer Information**: Optional customer ID and name
- **Financial Data**: Subtotals, taxes, discounts, and totals
- **Payment Information**: Payment types, amounts, and split payments
- **POS Features**: Loyalty points, coupons, delivery charges
- **Status Management**: Draft, finalized, paid, cancelled, refunded
- **Audit Trail**: Created/updated by user tracking

Key Features:
- Automatic invoice number generation (INV-YYYYMM-XXXXXX)
- Built-in calculation methods for totals and profits
- Stock quantity validation and updates
- Payment processing with multiple methods
- Comprehensive invoice statistics

### 2. Service Layer (`/server/src/services/invoice.service.js`)

Provides business logic for:

- **Invoice Management**: Create, read, update, delete operations
- **Validation**: Stock availability and business rule validation
- **Payment Processing**: Multiple payment methods and split payments
- **Inventory Updates**: Automatic stock quantity adjustments
- **Reporting**: Statistics and daily sales reports
- **Status Management**: Invoice finalization and cancellation

### 3. Controller Layer (`/server/src/controllers/invoice.controller.js`)

HTTP endpoint handlers for:

- `POST /invoices` - Create new invoice
- `GET /invoices` - List invoices with filtering and pagination
- `GET /invoices/:id` - Get specific invoice
- `PATCH /invoices/:id` - Update invoice
- `DELETE /invoices/:id` - Delete invoice (draft only)
- `PATCH /invoices/:id/finalize` - Finalize invoice
- `POST /invoices/:id/payment` - Process payment
- `PATCH /invoices/:id/cancel` - Cancel invoice
- `POST /invoices/:id/duplicate` - Duplicate invoice
- `GET /invoices/statistics` - Get invoice statistics
- `GET /invoices/reports/daily` - Daily sales report
- `GET /invoices/outstanding` - Outstanding invoices
- `GET /invoices/customer/:customerId` - Customer invoices

### 4. Validation Layer (`/server/src/validations/invoice.validation.js`)

Joi validation schemas for all endpoints ensuring data integrity.

### 5. Routes (`/server/src/routes/v1/invoice.route.js`)

RESTful API routes with authentication and authorization.

## Frontend Integration

### 1. Redux API Layer (`/client/src/stores/invoice.api.ts`)

RTK Query API service providing:

- Type-safe API calls
- Automatic caching and invalidation
- Loading states management
- Error handling

### 2. Updated Invoice Panel (`/client/src/features/invoice/components/invoice-panel.tsx`)

Enhanced with:

- Real API integration for saving invoices
- Loading states and error handling
- Automatic stock validation
- Success/error notifications

## API Usage Examples

### Creating an Invoice

```javascript
const invoiceData = {
  items: [
    {
      productId: "68a554c3879e0c15ec308550",
      name: "new mobile",
      quantity: 2,
      unitPrice: 20,
      cost: 20,
      subtotal: 40,
      profit: 0
    }
  ],
  customerId: "68a87d3ece580c68fa6a93f2",
  type: "cash",
  subtotal: 40,
  tax: 0,
  discount: 0,
  total: 40,
  totalProfit: 0,
  totalCost: 40,
  paidAmount: 40,
  balance: 0
}

// Using the API
const result = await createInvoice(invoiceData)
```

### Processing a Payment

```javascript
const paymentData = {
  amount: 500,
  method: "card",
  reference: "TXN123456"
}

await processPayment({ id: invoiceId, paymentData })
```

## Security & Permissions

The system includes role-based access control:

- **Users**: Can view invoices (`getInvoices`)
- **Admins**: Full invoice management (`manageInvoices`)

## Features Implemented

✅ **Complete Invoice CRUD Operations**
✅ **Automatic Stock Management**
✅ **Multiple Payment Methods**
✅ **Split Payment Support**
✅ **Invoice Status Management**
✅ **Comprehensive Reporting**
✅ **Search and Filtering**
✅ **Customer Association**
✅ **Audit Trail**
✅ **Data Validation**
✅ **Error Handling**
✅ **Type Safety**
✅ **Caching & Optimization**

## Database Schema

```javascript
{
  invoiceNumber: "INV-202508-000001",
  items: [
    {
      productId: ObjectId,
      name: String,
      image: { url: String, publicId: String },
      quantity: Number,
      unitPrice: Number,
      cost: Number,
      subtotal: Number,
      profit: Number,
      isManualEntry: Boolean
    }
  ],
  customerId: ObjectId,
  customerName: String,
  type: "cash|credit|pending",
  subtotal: Number,
  tax: Number,
  discount: Number,
  total: Number,
  totalProfit: Number,
  totalCost: Number,
  paidAmount: Number,
  balance: Number,
  status: "draft|finalized|paid|cancelled|refunded",
  invoiceDate: Date,
  createdAt: Date,
  updatedAt: Date
}
```

## Testing the API

To test the invoice API:

1. Start the server: `cd server && npm run dev`
2. Use the frontend invoice panel to create invoices
3. Check the database for saved invoices
4. Verify stock quantities are updated
5. Test payment processing and status updates

## Next Steps

The backend is now complete and ready for production use. You can:

1. **Test the Integration**: Use the frontend to create and save invoices
2. **Add More Features**: Implement invoice printing, email sending, etc.
3. **Extend Reporting**: Add more detailed analytics and reports
4. **Mobile Support**: The API is ready for mobile app integration
5. **Export Features**: Add PDF generation and export functionality

The system now provides a complete, production-ready invoice management solution with all the features needed for a modern POS system.
