import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Upload, Download, ChevronDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useSubCategories } from '../context/subcategories-context'
import { useLanguage } from '@/context/language-context'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Can, usePermissions } from '@/context/permission-context'
import Axios from '@/utils/Axios'
import summery from '@/utils/summery'
import * as XLSX from 'xlsx'

interface SubCategoriesPrimaryButtonsProps {
  hasCategories: boolean
  defaultCategoryId?: string | null
}

export default function SubCategoriesPrimaryButtons({ hasCategories, defaultCategoryId }: SubCategoriesPrimaryButtonsProps) {
  const { dispatch } = useSubCategories()
  const { t } = useLanguage()
  const { hasExplicitPermission } = usePermissions()
  const canImport = hasExplicitPermission('createCategories')
  const [exporting, setExporting] = useState(false)

  const handleAddSubCategory = () => {
    dispatch({ type: 'SET_SUBCATEGORY', payload: null })
    dispatch({ type: 'SET_DEFAULT_CATEGORY_ID', payload: defaultCategoryId ?? null })
    dispatch({ type: 'SET_OPEN', payload: true })
  }

  const handleImport = () => {
    dispatch({ type: 'SET_IMPORT_OPEN', payload: true })
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const response = await Axios(summery.fetchAllSubCategories)
      const subCategories = response.data?.results || response.data || []

      if (subCategories.length === 0) {
        toast.error(t('no_subcategories_to_export'))
        return
      }

      const rows = subCategories.map((subCategory: any) => ({
        name: subCategory.name || '',
        nameUrdu: subCategory.nameUrdu || '',
        category: typeof subCategory.category === 'object' ? subCategory.category?.name || '' : '',
        createdAt: subCategory.createdAt ? new Date(subCategory.createdAt).toLocaleDateString() : '',
      }))

      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Sub-Categories')
      ws['!cols'] = [{ wch: 30 }, { wch: 25 }, { wch: 30 }, { wch: 15 }]

      XLSX.writeFile(wb, `subcategories-export-${new Date().toISOString().split('T')[0]}.xlsx`)
      toast.success(t('export_successful'))
    } catch (error) {
      console.error('Error exporting sub-categories:', error)
      toast.error(t('error_exporting_data'))
    } finally {
      setExporting(false)
    }
  }

  const importExportMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <Upload className="h-4 w-4" />
          {t('Import / Export')}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canImport && (
          <DropdownMenuItem onClick={handleImport} disabled={!hasCategories}>
            <Upload className="mr-2 h-4 w-4" />
            {t('import_excel')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {t('export_excel')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const button = (
    <Button onClick={handleAddSubCategory} size="sm" className="h-9" disabled={!hasCategories}>
      <Plus className="mr-2 h-4 w-4" />
      {t('add_subcategory')}
    </Button>
  )

  if (hasCategories) {
    return (
      <Can permission="viewCategories">
        <div className="flex items-center space-x-2">
          {importExportMenu}
          <Can permission="createCategories">{button}</Can>
        </div>
      </Can>
    )
  }

  return (
    <Can permission="viewCategories">
      <div className="flex items-center space-x-2">
        {importExportMenu}
        <Can permission="createCategories">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">{button}</span>
            </TooltipTrigger>
            <TooltipContent>{t('create_category_first_hint')}</TooltipContent>
          </Tooltip>
        </Can>
      </div>
    </Can>
  )
}
