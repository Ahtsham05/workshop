# Excel Import Feature - Complete Documentation

## Overview
Complete Excel import functionality for bulk product uploads with comprehensive validation matching the backend MongoDB schema.

## Backend Implementation

### 1. Product Model Schema (`server/src/models/product.model.js`)

**Required Fields:**
- `name`: String (unique)
- `price`: Number
- `cost`: Number
- `stockQuantity`: Number

**Optional Fields:**
- `barcode`: String (unique, sparse index, allows null)
- `description`: String
- `category`: String (legacy)
- `categories`: Array of category objects
- `supplier`: ObjectId reference
- `unit`: String (default: 'pcs', enum: pcs/kg/ltr/etc)
- `sku`: String (SKU for inventory)
- `lowStockThreshold`: Number
- `image`: Object { url, publicId }

### 2. Backend Endpoint

**Route:** `POST /v1/products/bulk`

**Authentication:** Required (`manageProducts` permission)

**Validation:** Joi schema validates:
- Products array must have at least 1 item
- Each product must have: name, price, cost, stockQuantity
- Optional fields are validated but not required
- Barcodes can be empty string or null

**Request Body:**
```json
{
  "products": [
    {
      "name": "Product Name",
      "price": 100,
      "cost": 80,
      "stockQuantity": 50,
      "barcode": "1234567890",
      "category": "Electronics",
      "unit": "pcs",
      "sku": "SKU001",
      "lowStockThreshold": 10,
      "description": "Product description"
    }
  ]
}
```

**Response:**
```json
{
  "message": "Successfully imported 10 products",
  "success": true,
  "insertedCount": 10,
  "products": [...],
  "errors": [...]  // If any products failed (e.g., duplicates)
}
```

### 3. Service Layer (`server/src/services/product.service.js`)

**Function:** `bulkAddProducts(productsToAdd)`

**Features:**
- Processes and formats product data
- Handles null/empty values for optional fields
- Uses `insertMany` with `ordered: false` to continue on duplicates
- Returns successful inserts and errors separately
- Converts empty barcode strings to null for sparse unique index

**Error Handling:**
- Duplicate names/barcodes are caught
- Returns partial success with error details
- Continues inserting valid products even if some fail

## Frontend Implementation

### 1. Component (`client/src/features/products/components/product-import-dialog.tsx`)

**Features:**
- Template download with sample data
- File upload (supports .xlsx, .xls, .csv)
- Client-side validation before import
- Preview of parsed data (first 10 products)
- Error display with row numbers and field names
- Multi-language support (English/Urdu)

**Validation Rules:**
- **Required:** name, price, cost, stockQuantity
- **Optional:** barcode, category, unit, sku, lowStockThreshold, description
- All numeric fields must be positive numbers
- Empty rows are skipped automatically
- Header row detection and skip

**Template Structure:**
```
| name | barcode | price | cost | stockQuantity | category | unit | sku | lowStockThreshold | description |
```

### 2. Redux Integration (`client/src/stores/product.slice.ts`)

**Action:** `bulkAddProducts`

**Usage:**
```typescript
const result = await dispatch(bulkAddProducts({ products }))

if (result.meta.requestStatus === 'fulfilled') {
  // Success - refresh product list
  setFetch((prev) => !prev)
} else {
  // Handle error
  throw new Error(result.payload || 'Import failed')
}
```

## User Workflow

1. **Open Import Dialog**
   - Click "Import Excel" button on Products page
   - Dialog opens with instructions

2. **Download Template**
   - Click "Download Template" button
   - Opens Excel file with:
     - Header row with field descriptions
     - 2 sample product rows
     - Auto-sized columns
     - Proper formatting

3. **Fill Template**
   - Add product data starting from row 2
   - Required fields: name, price, cost, stockQuantity
   - Optional fields can be left empty
   - Barcode can be duplicated across files but not within same import

4. **Upload File**
   - Click "Select Excel File"
   - Choose filled template
   - File validation happens automatically

5. **Parse and Validate**
   - Click "Parse & Validate" button
   - System validates each row:
     - Checks required fields
     - Validates data types
     - Checks numeric ranges
     - Displays errors with row numbers

6. **Review Preview**
   - See first 10 products that will be imported
   - Check data is correct
   - Warning about existing products displayed

7. **Import**
   - Click "Import" button with count
   - Products are sent to backend
   - Success toast shows count of imported products
   - Product list refreshes automatically

## Validation Details

### Client-Side Validation

```typescript
// Required field validation
if (!product.name || product.name.trim() === '') {
  error: 'Product name is required'
}

if (product.price === undefined || product.price === null || product.price === '') {
  error: 'Price is required'
} else if (isNaN(Number(product.price)) || Number(product.price) < 0) {
  error: 'Price must be a valid positive number'
}

// Similar for cost and stockQuantity

// Optional field validation
if (product.lowStockThreshold !== undefined && product.lowStockThreshold !== '') {
  if (isNaN(Number(product.lowStockThreshold)) || Number(product.lowStockThreshold) < 0) {
    error: 'Low stock threshold must be a valid positive number'
  }
}
```

### Backend Validation (Joi)

```javascript
bulkAddProducts: {
  body: Joi.object().keys({
    products: Joi.array().items(
      Joi.object().keys({
        name: Joi.string().required(),
        price: Joi.number().required(),
        cost: Joi.number().required(),
        stockQuantity: Joi.number().required(),
        barcode: Joi.string().allow('', null).optional(),
        description: Joi.string().allow('').optional(),
        category: Joi.string().allow('').optional(),
        unit: Joi.string().allow('').optional(),
        sku: Joi.string().allow('').optional(),
        lowStockThreshold: Joi.number().optional(),
      })
    ).required().min(1)
  }),
}
```

## Error Handling

### Client-Side Errors

1. **File Type Error**
   - Message: "Invalid file type. Please select .xlsx, .xls, or .csv file"
   - Shown when wrong file type is selected

2. **Empty File Error**
   - Message: "The file is empty"
   - Shown when Excel has no data rows

3. **Validation Errors**
   - Message: "Validation Errors (X found in Excel file)"
   - Lists each error with: Row number, Field name, Error message
   - Example: "Row 3, field: price - Price is required"

4. **Parse Error**
   - Message: "Error parsing file"
   - Shown when Excel file is corrupted or can't be read

### Backend Errors

1. **Duplicate Name**
   - HTTP 400: "Product name 'XYZ' already exists"
   - Partial success: Other products still imported

2. **Duplicate Barcode**
   - HTTP 400: "Barcode 'XYZ' already exists"
   - Partial success: Other products still imported

3. **Validation Error**
   - HTTP 400: "Products array is required"
   - HTTP 400: Joi validation errors

## Translation Keys

### English
```javascript
"import_excel": "Import Excel"
"import_products_from_excel": "Import Products from Excel"
"download_template": "Download Template"
"select_excel_file": "Select Excel File"
"parse_and_validate": "Parse & Validate"
"validation_errors": "Validation Errors"
"file_parsed_successfully": "File parsed successfully"
"import_successful": "Import successful"
"product_name_required": "Product name is required"
"price_required": "Price is required"
"price_must_be_positive": "Price must be a valid positive number"
// ... and 20 more
```

### Urdu
```javascript
"import_excel": "ایکسل امپورٹ کریں"
"import_products_from_excel": "ایکسل سے پروڈکٹس امپورٹ کریں"
// ... all English keys have Urdu equivalents
```

## Testing Checklist

- [ ] Download template generates correct Excel file
- [ ] Template has correct headers and sample data
- [ ] File upload accepts .xlsx, .xls, .csv
- [ ] File upload rejects other file types
- [ ] Empty rows are skipped
- [ ] Header row is detected and skipped
- [ ] Required field validation works
- [ ] Optional field validation works
- [ ] Numeric range validation works
- [ ] Error messages show correct row numbers
- [ ] Preview shows first 10 products
- [ ] Import sends correct data to backend
- [ ] Success toast shows correct count
- [ ] Product list refreshes after import
- [ ] Duplicate names/barcodes handled gracefully
- [ ] Partial success works (some products fail)
- [ ] Both English and Urdu translations work
- [ ] Dialog closes after successful import
- [ ] Dialog can be cancelled
- [ ] Parse button only shows when file selected
- [ ] Import button only shows after successful parse

## File Structure

```
client/
  src/
    features/
      products/
        components/
          product-import-dialog.tsx  # Main import dialog component
    stores/
      product.slice.ts               # Redux slice with bulkAddProducts action
    context/
      language-context.tsx           # All translation keys

server/
  src/
    routes/
      v1/
        product.route.js             # POST /bulk endpoint
    controllers/
      product.controller.js          # bulkAddProducts controller
    services/
      product.service.js             # bulkAddProducts service
    validations/
      product.validation.js          # bulkAddProducts validation schema
    models/
      product.model.js               # Product schema definition
```

## API Endpoint Summary

**Endpoint:** `POST /api/v1/products/bulk`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "products": [
    {
      "name": "Required",
      "price": 0,
      "cost": 0,
      "stockQuantity": 0,
      "barcode": "optional",
      "category": "optional",
      "unit": "optional",
      "sku": "optional",
      "lowStockThreshold": 0,
      "description": "optional"
    }
  ]
}
```

## Notes

- Empty barcode values are converted to `null` to work with MongoDB sparse unique index
- `ordered: false` allows partial success on duplicate errors
- Template auto-downloads with proper column widths for readability
- Excel parsing handles different date formats and empty cells gracefully
- All validation messages are translatable for i18n support
- Product list automatically refreshes after successful import
