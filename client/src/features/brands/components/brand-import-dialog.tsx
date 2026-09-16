/**
 * Import brands from a spreadsheet — a thin configuration over the shared
 * ExcelImportDialog, which handles the file itself (header detection, column matching,
 * batching, partial success, per-row reporting).
 */

import { useCallback, useMemo } from 'react'
import { useBrands } from '../context/brands-context'
import { useBulkAddBrandsMutation } from '@/stores/brand.api'
import { useLanguage } from '@/context/language-context'
import {
  ExcelImportDialog,
  type BuiltRow,
  type ImportBatchOutcome,
} from '@/components/excel-import-dialog'
import {
  parseText,
  withCommonAliases,
  type CellValue,
  type ImportFieldSpec,
} from '@/lib/excel-import'

interface ImportBrand {
  name: string
  country?: string
  website?: string
  contactPerson?: string
  email?: string
  phone?: string
  description?: string
}

const BRAND_FIELDS: ImportFieldSpec[] = [
  withCommonAliases({
    key: 'name',
    label: 'Brand Name',
    required: true,
    width: 25,
    aliases: ['Brand', 'Make', 'Manufacturer', 'Company'],
  }),
  { key: 'country', label: 'Country', width: 20, aliases: ['Origin', 'Country of Origin', 'Made In'] },
  { key: 'website', label: 'Website', width: 30, aliases: ['Site', 'URL', 'Web'] },
  { key: 'contactPerson', label: 'Contact Person', width: 25, aliases: ['Contact', 'Person', 'Representative', 'Rep'] },
  withCommonAliases({ key: 'email', label: 'Email', width: 30 }),
  withCommonAliases({ key: 'phone', label: 'Phone', type: 'code', width: 18 }),
  withCommonAliases({ key: 'description', label: 'Description', width: 35 }),
]

const SAMPLE_ROWS = [
  { name: 'Samsung', country: 'South Korea', website: 'https://samsung.com', contactPerson: '', email: '', phone: '', description: '' },
  { name: 'Nike', country: 'United States', website: '', contactPerson: '', email: '', phone: '', description: '' },
]

export function BrandImportDialog() {
  const { state, dispatch: contextDispatch } = useBrands()
  const [bulkAddBrands] = useBulkAddBrandsMutation()
  const { t } = useLanguage()

  const buildRow = useCallback(
    (values: Record<string, CellValue>): BuiltRow<ImportBrand> => {
      const name = parseText(values.name)
      if (!name) return { error: t('Brand name is empty') }

      const brand: ImportBrand = { name }
      const warnings: string[] = []

      const country = parseText(values.country)
      if (country) brand.country = country
      const contactPerson = parseText(values.contactPerson)
      if (contactPerson) brand.contactPerson = contactPerson
      const phone = parseText(values.phone, { code: true })
      if (phone) brand.phone = phone
      const description = parseText(values.description)
      if (description) brand.description = description

      const email = parseText(values.email)
      if (email) {
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) brand.email = email
        else warnings.push(t('Email "{{value}}" does not look valid and was left out', { value: email }))
      }

      const website = parseText(values.website)
      if (website) {
        // Spreadsheets carry bare domains far more often than full URLs; adding the
        // scheme here keeps the link clickable instead of failing validation.
        brand.website = /^https?:\/\//i.test(website) ? website : `https://${website}`
      }

      return { value: brand, warning: warnings.length ? warnings.join('; ') : undefined }
    },
    [t]
  )

  const importBatch = useCallback(
    async (items: ImportBrand[]): Promise<ImportBatchOutcome> => {
      const result = await bulkAddBrands({ brands: items }).unwrap()
      return {
        insertedCount: result?.insertedCount ?? 0,
        errors: result?.errors,
        // Brand names that already exist come back as warnings (skipped, not duplicated).
        skipped: result?.warnings?.map((warning) => ({ index: warning.index, reason: warning.message })),
      }
    },
    [bulkAddBrands]
  )

  const duplicateKeys = useMemo(
    () => [{ label: t('brand name'), get: (item: ImportBrand) => item.name }],
    [t]
  )

  return (
    <ExcelImportDialog<ImportBrand>
      open={state.importOpen}
      onOpenChange={(next) => contextDispatch({ type: 'SET_IMPORT_OPEN', payload: next })}
      title={t('Import Brands from Excel')}
      description={t('Upload a list of brands. Names that already exist are left as they are.')}
      entityPlural={t('brands')}
      fields={BRAND_FIELDS}
      sampleRows={SAMPLE_ROWS}
      templateFileName='brands-import-template.xlsx'
      templateSheetName='Brands'
      buildRow={buildRow}
      importBatch={importBatch}
      duplicateKeys={duplicateKeys}
      renderPreview={(brand) => (
        <div>
          <span className='font-medium'>{brand.name}</span>
          {brand.country && <span className='text-muted-foreground'> · {brand.country}</span>}
          {brand.website && <span className='text-muted-foreground'> · {brand.website}</span>}
        </div>
      )}
    />
  )
}
