/**
 * Import sub-categories from a spreadsheet — a thin configuration over the shared
 * ExcelImportDialog. Each row names the category it belongs under; the server matches
 * that name to an existing category (see subCategory.service.js#bulkImportSubCategories).
 */

import { useCallback, useMemo } from 'react'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { bulkImportSubCategories } from '@/stores/subCategory.slice'
import { useLanguage } from '@/context/language-context'
import { useSubCategories } from '../context/subcategories-context'
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

interface SubCategoryImportDialogProps {
  setFetch: (updater: (prev: boolean) => boolean) => void
}

/** A row the server chose not to import (e.g. the name already exists). */
interface ImportWarning {
  index?: number
  message: string
}

interface ImportSubCategory {
  name: string
  nameUrdu?: string
  category: string
}

const SUBCATEGORY_FIELDS: ImportFieldSpec[] = [
  withCommonAliases({
    key: 'name',
    label: 'Sub-Category Name',
    required: true,
    width: 30,
    aliases: ['Sub Category', 'Subcategory', 'Sub Group', 'Sub Type'],
  }),
  withCommonAliases({ key: 'nameUrdu', label: 'Name (Urdu)', width: 25 }),
  {
    key: 'category',
    label: 'Category',
    required: true,
    width: 30,
    aliases: ['Parent Category', 'Main Category', 'Group', 'کیٹیگری'],
  },
]

const SAMPLE_ROWS = [
  { name: 'Action Cams', nameUrdu: '', category: 'Memories Storage & Accessories' },
  { name: 'Tripods', nameUrdu: 'ٹرائی پوڈ', category: 'Microphones / Gimbals' },
]

export function SubCategoryImportDialog({ setFetch }: SubCategoryImportDialogProps) {
  const { state, dispatch: contextDispatch } = useSubCategories()
  const reduxDispatch = useDispatch<AppDispatch>()
  const { t } = useLanguage()

  const buildRow = useCallback(
    (values: Record<string, CellValue>): BuiltRow<ImportSubCategory> => {
      const name = parseText(values.name)
      if (!name) return { error: t('Sub-category name is empty') }
      const category = parseText(values.category)
      if (!category) {
        return { error: t('No category given — a sub-category has to sit under a category') }
      }
      const subCategory: ImportSubCategory = { name, category }
      const nameUrdu = parseText(values.nameUrdu)
      if (nameUrdu) subCategory.nameUrdu = nameUrdu
      return { value: subCategory }
    },
    [t]
  )

  const importBatch = useCallback(
    async (items: ImportSubCategory[]): Promise<ImportBatchOutcome> => {
      const result = await reduxDispatch(bulkImportSubCategories({ items })).unwrap()
      return {
        insertedCount: result?.insertedCount ?? 0,
        errors: result?.errors,
        skipped: result?.warnings?.map((warning: ImportWarning) => ({ index: warning.index, reason: warning.message })),
      }
    },
    [reduxDispatch]
  )

  // Two rows with the same name under different categories are perfectly valid, so the
  // pair is what has to be unique, not the name on its own.
  const duplicateKeys = useMemo(
    () => [
      {
        label: t('sub-category'),
        get: (item: ImportSubCategory) => `${item.category}›${item.name}`,
      },
    ],
    [t]
  )

  return (
    <ExcelImportDialog<ImportSubCategory>
      open={state.importOpen}
      onOpenChange={(next) => contextDispatch({ type: 'SET_IMPORT_OPEN', payload: next })}
      title={t('Import Sub-Categories from Excel')}
      description={t('Each row needs the category it belongs under. Sub-categories that already exist are left as they are.')}
      entityPlural={t('sub-categories')}
      fields={SUBCATEGORY_FIELDS}
      sampleRows={SAMPLE_ROWS}
      templateFileName='subcategories-import-template.xlsx'
      templateSheetName='Sub-Categories'
      buildRow={buildRow}
      importBatch={importBatch}
      duplicateKeys={duplicateKeys}
      onImported={() => setFetch((prev) => !prev)}
      renderPreview={(subCategory) => (
        <div>
          <span className='font-medium'>{subCategory.name}</span>
          <span className='text-muted-foreground'> · {subCategory.category}</span>
        </div>
      )}
    />
  )
}
