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
import { useCategories } from '../context/categories-context'
import { useLanguage } from '@/context/language-context'
import { Can, usePermissions } from '@/context/permission-context'
import Axios from '@/utils/Axios'
import summery from '@/utils/summery'
import * as XLSX from 'xlsx'

export default function CategoriesPrimaryButtons() {
  const { dispatch } = useCategories()
  const { t } = useLanguage()
  const { hasExplicitPermission } = usePermissions()
  const canImport = hasExplicitPermission('createCategories')
  const [exporting, setExporting] = useState(false)

  const handleAddCategory = () => {
    dispatch({ type: 'SET_CATEGORY', payload: null })
    dispatch({ type: 'SET_OPEN', payload: true })
  }

  const handleImport = () => {
    dispatch({ type: 'SET_IMPORT_OPEN', payload: true })
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const response = await Axios(summery.fetchAllCategories)
      const categories = response.data?.results || response.data || []

      if (categories.length === 0) {
        toast.error(t('no_categories_to_export'))
        return
      }

      const rows = categories.map((category: any) => ({
        name: category.name || '',
        nameUrdu: category.nameUrdu || '',
        createdAt: category.createdAt ? new Date(category.createdAt).toLocaleDateString() : '',
      }))

      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Categories')
      ws['!cols'] = [{ wch: 30 }, { wch: 25 }, { wch: 15 }]

      XLSX.writeFile(wb, `categories-export-${new Date().toISOString().split('T')[0]}.xlsx`)
      toast.success(t('export_successful'))
    } catch (error) {
      console.error('Error exporting categories:', error)
      toast.error(t('error_exporting_data'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex items-center space-x-2">
      <Can permission="viewCategories">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <Upload className="h-4 w-4" />
              {t('Import / Export')}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canImport && (
              <DropdownMenuItem onClick={handleImport}>
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
      </Can>
      <Can permission="createCategories">
        <Button onClick={handleAddCategory} size="sm" className="h-8">
          <Plus className="mr-2 h-4 w-4" />
          {t('add_category')}
        </Button>
      </Can>
    </div>
  )
}
