import { useState } from 'react'
import { useDispatch } from 'react-redux'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Upload, Download, ChevronDown, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useBrands } from '../context/brands-context'
import { Can, usePermissions } from '@/context/permission-context'
import { AppDispatch } from '@/stores/store'
import { brandApi } from '@/stores/brand.api'
import * as XLSX from 'xlsx'

export default function BrandsPrimaryButtons() {
  const { dispatch } = useBrands()
  const reduxDispatch = useDispatch<AppDispatch>()
  const { hasExplicitPermission } = usePermissions()
  const canImport = hasExplicitPermission('createBrands')
  const [exporting, setExporting] = useState(false)

  const handleAddBrand = () => {
    dispatch({ type: 'SET_BRAND', payload: null })
    dispatch({ type: 'SET_OPEN', payload: true })
  }

  const handleImport = () => {
    dispatch({ type: 'SET_IMPORT_OPEN', payload: true })
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      // Every brand regardless of status — the paginated list endpoint has no default
      // status filter (unlike /brands/all, which defaults to active-only), so a large
      // limit here gets the full, unfiltered set in one call.
      const result = await reduxDispatch(
        brandApi.endpoints.getBrands.initiate({ limit: 10000, sortBy: 'name:asc' }, { subscribe: false, forceRefetch: true })
      ).unwrap()
      const brands = result?.results || []

      if (brands.length === 0) {
        toast.error('No brands to export')
        return
      }

      const rows = brands.map((brand) => ({
        name: brand.name || '',
        country: brand.country || '',
        website: brand.website || '',
        contactPerson: brand.contactPerson || '',
        email: brand.email || '',
        phone: brand.phone || '',
        description: brand.description || '',
        status: brand.status || 'active',
        createdAt: brand.createdAt ? new Date(brand.createdAt).toLocaleDateString() : '',
      }))

      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Brands')
      ws['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 30 }, { wch: 25 }, { wch: 30 }, { wch: 18 }, { wch: 35 }, { wch: 12 }, { wch: 15 }]

      XLSX.writeFile(wb, `brands-export-${new Date().toISOString().split('T')[0]}.xlsx`)
      toast.success('Exported successfully')
    } catch (error) {
      console.error('Error exporting brands:', error)
      toast.error('Error exporting data')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex items-center space-x-2">
      <Can permission="viewBrands">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <Upload className="h-4 w-4" />
              Import / Export
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canImport && (
              <DropdownMenuItem onClick={handleImport}>
                <Upload className="mr-2 h-4 w-4" />
                Import Excel
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={handleExport} disabled={exporting}>
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Export Excel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Can>
      <Can permission="createBrands">
        <Button onClick={handleAddBrand} size="sm" className="h-8">
          <Plus className="mr-2 h-4 w-4" />
          Add Brand
        </Button>
      </Can>
    </div>
  )
}
