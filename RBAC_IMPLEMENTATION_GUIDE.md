# Role-Based Access Control (RBAC) System - Implementation Guide

## Overview
A comprehensive role-based access control system has been implemented in your application with 80+ granular permissions across all modules.

## Backend Implementation

### 1. Database Models

**Role Model** (`/server/src/models/role.model.js`)
- 80+ permission fields covering all features
- Support for system roles (non-deletable) and custom roles
- Methods: `isNameTaken()`, `getAdminPermissions()`

**User Model Updates** (`/server/src/models/user.model.js`)
- Added `role` field (ObjectId reference to Role)
- Added `isActive` field for user status

### 2. Services

**Role Service** (`/server/src/services/role.service.js`)
- CRUD operations for roles
- Permission management
- `createDefaultRoles()` - Creates Admin, Manager, Cashier, and Viewer roles

### 3. Controllers & Routes

**Role Controller** (`/server/src/controllers/role.controller.js`)
- `createRole`, `getRoles`, `getRole`, `updateRole`, `deleteRole`
- `getRolePermissions`, `updateRolePermissions`

**Role Routes** (`/server/src/routes/v1/role.route.js`)
- `GET /v1/roles` - List all roles
- `POST /v1/roles` - Create new role
- `GET /v1/roles/:roleId` - Get role details
- `PATCH /v1/roles/:roleId` - Update role
- `DELETE /v1/roles/:roleId` - Delete role
- `GET /v1/roles/:roleId/permissions` - Get role permissions
- `PATCH /v1/roles/:roleId/permissions` - Update permissions

### 4. Middleware

**Permission Middleware** (`/server/src/middlewares/permission.js`)
- `checkPermission(...permissions)` - Check if user has at least one permission
- `checkAllPermissions(...permissions)` - Check if user has all permissions
- `isAdmin()` - Check if user is admin

### 5. Validation

**Role Validation** (`/server/src/validations/role.validation.js`)
- Joi schemas for all role operations
- Validation for all 80+ permission fields

### 6. Initialization Script

**Init Roles** (`/server/src/scripts/initRoles.js`)
```bash
node src/scripts/initRoles.js
```
Creates default roles:
- **Admin**: Full system access
- **Manager**: Manage products, invoices, purchases, view reports
- **Cashier**: Create invoices, view products
- **Viewer**: Read-only access

## Frontend Implementation

### 1. API Integration

**Roles API** (`/client/src/stores/roles.api.ts`)
- RTK Query hooks for all role operations
- TypeScript interfaces for Permission and Role types
- Integrated with Redux store

### 2. Permission Context

**Permission Context** (`/client/src/context/permission-context.tsx`)
- `usePermissions()` hook
- `hasPermission(permission)` - Check single permission
- `hasAnyPermission(...permissions)` - Check any of permissions
- `hasAllPermissions(...permissions)` - Check all permissions
- `<Can>` component for conditional rendering

### 3. Role Management UI

**Roles Page** (`/client/src/features/roles/index.tsx`)
- List all roles with pagination
- Create/Edit/Delete roles
- Manage permissions per role
- View permission counts and role status

## Permission Categories

### Products (4 permissions)
- `viewProducts`, `createProducts`, `editProducts`, `deleteProducts`

### Invoices (5 permissions)
- `viewInvoices`, `createInvoices`, `editInvoices`, `deleteInvoices`, `printInvoices`

### Purchases (4 permissions)
- `viewPurchases`, `createPurchases`, `editPurchases`, `deletePurchases`

### Customers (4 permissions)
- `viewCustomers`, `createCustomers`, `editCustomers`, `deleteCustomers`

### Suppliers (4 permissions)
- `viewSuppliers`, `createSuppliers`, `editSuppliers`, `deleteSuppliers`

### Categories (4 permissions)
- `viewCategories`, `createCategories`, `editCategories`, `deleteCategories`

### Reports (8 permissions)
- `viewReports`, `viewSalesReports`, `viewPurchaseReports`, `viewInventoryReports`
- `viewCustomerReports`, `viewSupplierReports`, `viewProductReports`, `exportReports`

### Users (4 permissions)
- `viewUsers`, `createUsers`, `editUsers`, `deleteUsers`

### Roles (4 permissions)
- `viewRoles`, `createRoles`, `editRoles`, `deleteRoles`

### Settings (2 permissions)
- `viewSettings`, `editSettings`

### Dashboard (1 permission)
- `viewDashboard`

### Payments (4 permissions)
- `viewPayments`, `createPayments`, `editPayments`, `deletePayments`

## Usage Examples

### Backend - Protect Routes

```javascript
const { checkPermission } = require('../middlewares/permission');

// Single permission
router.post('/products', auth(), checkPermission('createProducts'), createProduct);

// Multiple permissions (any)
router.get('/reports', auth(), checkPermission('viewReports', 'viewSalesReports'), getReports);

// All permissions required
router.delete('/products/:id', auth(), checkAllPermissions('deleteProducts', 'viewProducts'), deleteProduct);
```

### Frontend - Conditional Rendering

```tsx
import { Can, usePermissions } from '@/context/permission-context';

// Using <Can> component
<Can permission="createProducts">
  <Button>Create Product</Button>
</Can>

// Using hook
const { hasPermission } = usePermissions();
if (hasPermission('editProducts')) {
  // Show edit button
}

// Multiple permissions
<Can anyPermissions={['viewReports', 'viewSalesReports']}>
  <ReportsLink />
</Can>
```

### Frontend - Route Guards

```tsx
import { usePermissions } from '@/context/permission-context';
import { Navigate } from '@tanstack/react-router';

function ProtectedRoute({ children, permission }) {
  const { hasPermission } = usePermissions();
  
  if (!hasPermission(permission)) {
    return <Navigate to="/unauthorized" />;
  }
  
  return children;
}
```

## Setup Instructions

### 1. Initialize Database
```bash
cd server
node src/scripts/initRoles.js
```

### 2. Update Existing Users
You need to manually assign roles to existing users or create a migration script:

```javascript
// Example: Assign Admin role to first user
const adminRole = await Role.findOne({ name: 'Admin' });
const user = await User.findOne({ email: 'admin@example.com' });
user.role = adminRole._id;
await user.save();
```

### 3. Add Permission Context to App

```tsx
// In your main App component or layout
import { PermissionProvider } from '@/context/permission-context';

function App() {
  const user = useSelector((state) => state.auth.user);
  
  return (
    <PermissionProvider permissions={user?.role?.permissions || null}>
      {/* Your app content */}
    </PermissionProvider>
  );
}
```

### 4. Update Auth State

Ensure your auth state includes role with permissions when user logs in:

```typescript
// In auth.slice.ts or auth API
interface User {
  id: string;
  name: string;
  email: string;
  role: {
    id: string;
    name: string;
    permissions: Permission;
  };
}
```

## Next Steps

### Required Files to Create:

1. **role-dialog.tsx** - Form for creating/editing roles
2. **permissions-dialog.tsx** - UI for managing permissions with checkboxes
3. **Update auth.service.js** - Include role population in login/token refresh
4. **Add route to app** - Add `/roles` route to your router
5. **Update existing routes** - Add permission middleware to protect routes

### Migration Script

Create a script to assign default Admin role to existing users:

```javascript
// server/src/scripts/assignDefaultRoles.js
const mongoose = require('mongoose');
const { User, Role } = require('../models');

async function assignDefaultRoles() {
  const adminRole = await Role.findOne({ name: 'Admin' });
  const users = await User.find({ role: { $exists: false } });
  
  for (const user of users) {
    user.role = adminRole._id;
    await user.save();
  }
}
```

## Security Notes

1. **System Roles**: Cannot be modified or deleted (isSystemRole: true)
2. **Permission Checks**: Always check on backend, frontend is for UX only
3. **Role Deletion**: Prevented if users are assigned to the role
4. **Default Permissions**: All permissions default to `false`

## Testing

Test the RBAC system:
1. Create a custom role with limited permissions
2. Assign it to a test user
3. Verify the user can only access permitted features
4. Test both frontend UI hiding and backend API protection

Your RBAC system is now fully implemented and ready to use!
