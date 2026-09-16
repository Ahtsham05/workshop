/**
 * Import products from a spreadsheet.
 *
 * All of the file handling — locating the header row, matching columns however they're
 * spelled, cleaning up "Rs 1,250/-" style cells, batching, partial success, the report
 * of rows that didn't make it — lives in the shared ExcelImportDialog. What's left here
 * is what's specific to a product: which columns exist, how a row becomes a product, and
 * what to do about products that are already in the catalogue.
 */

import { useCallback, useMemo, useState } from 'react'
import { useFormatMoney } from '@/lib/format-money'
import { useLanguage } from '@/context/language-context'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ExcelImportDialog,
  type BuiltRow,
  type ImportBatchOutcome,
} from '@/components/excel-import-dialog'
import {
  parseNumeric,
  parseText,
  withCommonAliases,
  type CellValue,
  type ImportFieldSpec,
} from '@/lib/excel-import'

/** What the bulk endpoint sends back for one batch. */
export interface BulkImportResult {
  insertedCount?: number
  /** Rows that matched an existing product and were updated instead of inserted. */
  updatedCount?: number
  errors?: Array<{ index: number; error?: string; name?: string; barcode?: string | null }>
  /** Rows deliberately left alone (already in the catalogue) — not failures. */
  skipped?: Array<{ index: number; name?: string; reason: string }>
  /** Rows that imported, with something worth knowing (a defaulted unit, say). */
  warnings?: Array<{ index: number; name?: string; message: string }>
  createdCategories?: string[]
  createdSubCategories?: string[]
}

/** How rows matching a product that already exists should be treated. */
export type DuplicateStrategy = 'skip' | 'update' | 'error'

interface ProductImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (
    products: ImportProduct[],
    options: { duplicateStrategy: DuplicateStrategy }
  ) => Promise<BulkImportResult | void>
}

interface ImportProduct {
  name: string
  nameUrdu?: string
  barcode?: string | null
  price: number
  cost: number
  stockQuantity: number
  category?: string
  subCategory?: string
  supplier?: string
  unit?: string
  sku?: string
  lowStockThreshold?: number
  description?: string
}

/** Optional product fields that are plain pass-through text. */
type TextField = 'nameUrdu' | 'category' | 'subCategory' | 'supplier' | 'unit' | 'description'

/**
 * Column order here is the template's column order, which is also the order used to
 * match columns positionally when a file has no header row at all.
 */
const PRODUCT_FIELDS: ImportFieldSpec[] = [
  withCommonAliases({
    key: 'name',
    label: 'Product Name',
    required: true,
    width: 30,
    aliases: ['Item', 'Item Name', 'Product', 'Products', 'Item Description', 'Maal', 'Maal ka Naam', 'Naam', 'پروڈکٹ', 'مال'],
  }),
  withCommonAliases({ key: 'nameUrdu', label: 'Name (Urdu)', width: 25 }),
  {
    key: 'barcode',
    label: 'Barcode',
    type: 'code',
    width: 20,
    aliases: ['Bar Code', 'Barcode No', 'EAN', 'UPC', 'Scan Code', 'بارکوڈ'],
  },
  {
    key: 'price',
    label: 'Sale Price',
    type: 'number',
    required: true,
    width: 14,
    aliases: ['Price', 'Selling Price', 'Retail Price', 'Sales Price', 'MRP', 'Rate', 'Unit Price', 'Qeemat', 'Sale Rate', 'قیمت', 'فروخت'],
  },
  {
    key: 'cost',
    label: 'Purchase Price',
    type: 'number',
    required: true,
    width: 16,
    aliases: ['Cost', 'Cost Price', 'Buy Price', 'Buying Price', 'Purchase Rate', 'Kharid', 'Kharid Rate', 'خرید', 'لاگت'],
  },
  {
    key: 'stockQuantity',
    label: 'Stock Quantity',
    type: 'number',
    required: true,
    width: 16,
    aliases: ['Stock', 'Qty', 'Quantity', 'Stock Qty', 'Opening Stock', 'Available Qty', 'In Stock', 'Balance Qty', 'Tadaad', 'مقدار', 'اسٹاک'],
  },
  { key: 'category', label: 'Category', width: 20, aliases: ['Group', 'Main Category', 'Department', 'کیٹیگری'] },
  { key: 'subCategory', label: 'Sub Category', width: 20, aliases: ['Subcategory', 'Sub Group', 'Sub Type'] },
  { key: 'supplier', label: 'Supplier', width: 20, aliases: ['Vendor', 'Supplier Name', 'Party', 'سپلائر'] },
  { key: 'unit', label: 'Unit', width: 12, aliases: ['UOM', 'Unit of Measure', 'Measure', 'یونٹ'] },
  { key: 'sku', label: 'SKU', type: 'code', width: 15, aliases: ['Item Code', 'Product Code', 'Code', 'Article Code', 'Ref'] },
  {
    key: 'lowStockThreshold',
    label: 'Low Stock Alert',
    type: 'number',
    width: 16,
    aliases: ['Low Stock', 'Min Stock', 'Minimum Stock', 'Reorder Level', 'Alert Qty', 'Re-order'],
  },
  withCommonAliases({ key: 'description', label: 'Description', width: 35 }),
]

const SAMPLE_ROWS = [
  {
    name: 'Sample Product 1',
    nameUrdu: 'سیمپل پروڈکٹ 1',
    barcode: '1234567890',
    price: 100,
    cost: 80,
    stockQuantity: 50,
    category: 'Electronics',
    subCategory: 'Mobile Accessories',
    supplier: 'Acme Distributors',
    unit: 'pcs',
    sku: 'SKU001',
    lowStockThreshold: 10,
    description: 'Sample product description',
  },
  {
    name: 'Sample Product 2',
    nameUrdu: 'سیمپل پروڈکٹ 2',
    barcode: '0987654321',
    price: 250,
    cost: 200,
    stockQuantity: 30,
    category: 'Accessories',
    subCategory: '',
    supplier: '',
    unit: 'pcs',
    sku: 'SKU002',
    lowStockThreshold: 5,
    description: 'Another sample product',
  },
]

export function ProductImportDialog({ open, onOpenChange, onImport }: ProductImportDialogProps) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('skip')

  const buildRow = useCallback(
    (
      values: Record<string, CellValue>,
      { has }: { has: (field: string) => boolean }
    ): BuiltRow<ImportProduct> => {
      const name = parseText(values.name)
      if (!name) return { error: t('Product name is empty') }

      const warnings: string[] = []

      /**
       * A price/cost/stock column the file doesn't have at all is imported as 0 — plenty
       * of price lists carry only a sale price, and failing every row of one because it
       * has no Cost column helps nobody. An empty cell in a column that IS there is a
       * different thing: the file meant to say something and didn't, so the row waits.
       */
      const readAmount = (
        field: 'price' | 'cost' | 'stockQuantity',
        label: string
      ): { value: number } | { error: string } => {
        if (!has(field)) return { value: 0 }
        const parsed = parseNumeric(values[field])
        if (parsed.empty) return { error: t('{{label}} is empty', { label }) }
        if (!parsed.ok) return { error: t('{{label}} "{{value}}" is not a number', { label, value: parsed.raw }) }
        if (parsed.value < 0) return { error: t('{{label}} cannot be negative', { label }) }
        return { value: parsed.value }
      }

      const price = readAmount('price', t('Sale price'))
      if ('error' in price) return { error: price.error }
      const cost = readAmount('cost', t('Purchase price'))
      if ('error' in cost) return { error: cost.error }
      const stock = readAmount('stockQuantity', t('Stock quantity'))
      if ('error' in stock) return { error: stock.error }

      const product: ImportProduct = {
        name,
        price: price.value,
        cost: cost.value,
        stockQuantity: stock.value,
      }

      const barcode = parseText(values.barcode, { code: true })
      if (barcode) product.barcode = barcode
      const sku = parseText(values.sku, { code: true })
      if (sku) product.sku = sku

      const optionalText: Array<[TextField, string]> = [
        ['nameUrdu', parseText(values.nameUrdu)],
        ['category', parseText(values.category)],
        ['subCategory', parseText(values.subCategory)],
        ['supplier', parseText(values.supplier)],
        ['unit', parseText(values.unit)],
        ['description', parseText(values.description)],
      ]
      optionalText.forEach(([key, value]) => {
        if (value) product[key] = value
      })

      // A bad optional cell is never worth losing the row over — the product imports
      // without it and the dialog says so.
      const lowStock = parseNumeric(values.lowStockThreshold)
      if (!lowStock.empty) {
        if (lowStock.ok && lowStock.value >= 0) {
          product.lowStockThreshold = lowStock.value
        } else {
          warnings.push(t('Low stock alert "{{value}}" was ignored', { value: lowStock.raw }))
        }
      }

      if (price.value > 0 && cost.value > 0 && price.value < cost.value) {
        warnings.push(t('Sale price is below the purchase price'))
      }

      return { value: product, warning: warnings.length ? warnings.join('; ') : undefined }
    },
    [t]
  )

  const importBatch = useCallback(
    async (items: ImportProduct[]): Promise<ImportBatchOutcome> => {
      const result = (await onImport(items, { duplicateStrategy })) || {}
      const notes: string[] = []
      if (result.createdCategories?.length) {
        notes.push(
          t('Created {{count}} new categories: {{names}}', {
            count: result.createdCategories.length,
            names: result.createdCategories.slice(0, 5).join(', '),
          })
        )
      }
      if (result.createdSubCategories?.length) {
        notes.push(
          t('Created {{count}} new sub-categories: {{names}}', {
            count: result.createdSubCategories.length,
            names: result.createdSubCategories.slice(0, 5).join(', '),
          })
        )
      }
      if (result.updatedCount) {
        notes.push(t('{{count}} products that were already in the catalogue were updated', { count: result.updatedCount }))
      }
      return {
        // Updated rows are imports too — counting only inserts would report "nothing was
        // imported" for a price-list refresh where every row already existed.
        insertedCount: (result.insertedCount || 0) + (result.updatedCount || 0),
        errors: result.errors,
        // Rows the server left alone on purpose, kept apart from rows that failed.
        skipped: result.skipped?.map((skip) => ({ index: skip.index, reason: skip.reason })),
        // Rows that did import, with a note (an unknown unit that was defaulted, a
        // supplier name that matched nothing) — visible, but not listed as a problem.
        warnings: result.warnings?.map((warning) => ({ index: warning.index, message: warning.message })),
        notes,
      }
    },
    [onImport, duplicateStrategy, t]
  )

  const duplicateKeys = useMemo(
    () => [
      { label: t('barcode'), get: (item: ImportProduct) => item.barcode || undefined },
      { label: t('SKU'), get: (item: ImportProduct) => item.sku || undefined },
    ],
    [t]
  )

  return (
    <ExcelImportDialog<ImportProduct>
      open={open}
      onOpenChange={onOpenChange}
      title={t('Import Products from Excel')}
      description={t('Upload your product list. Columns are matched automatically — you can check and change them before importing.')}
      entityPlural={t('products')}
      fields={PRODUCT_FIELDS}
      sampleRows={SAMPLE_ROWS}
      templateFileName='products-import-template.xlsx'
      templateSheetName='Products'
      buildRow={buildRow}
      importBatch={importBatch}
      duplicateKeys={duplicateKeys}
      options={
        <div className='space-y-1.5'>
          <Label className='text-sm'>{t('If a product is already in the catalogue')}</Label>
          <Select value={duplicateStrategy} onValueChange={(value) => setDuplicateStrategy(value as DuplicateStrategy)}>
            <SelectTrigger className='h-8 w-full sm:w-[320px]'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='skip'>{t('Skip it (keep what is already saved)')}</SelectItem>
              <SelectItem value='update'>{t('Update its price, cost and details (stock is not changed)')}</SelectItem>
              <SelectItem value='error'>{t('Report it as a problem row')}</SelectItem>
            </SelectContent>
          </Select>
          <p className='text-xs text-muted-foreground'>
            {t('Products are matched by barcode, then by SKU.')}
          </p>
        </div>
      }
      renderPreview={(product) => (
        <>
          <div className='font-medium'>
            {product.name}
            {product.nameUrdu && (
              <span className='font-normal text-muted-foreground'>
                {' · '}
                <span dir='rtl'>{product.nameUrdu}</span>
              </span>
            )}
          </div>
          <div className='text-muted-foreground'>
            {t('Price')}: {formatMoney(product.price)} | {t('Cost')}: {formatMoney(product.cost)} |{' '}
            {t('Stock')}: {product.stockQuantity}
            {product.barcode ? ` | ${t('Barcode')}: ${product.barcode}` : ''}
          </div>
        </>
      )}
    />
  )
}
