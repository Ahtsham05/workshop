import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { useBrands } from '../context/brands-context'
import { Can } from '@/context/permission-context'

export default function BrandsPrimaryButtons() {
  const { dispatch } = useBrands()

  const handleAddBrand = () => {
    dispatch({ type: 'SET_BRAND', payload: null })
    dispatch({ type: 'SET_OPEN', payload: true })
  }

  return (
    <div className="flex items-center space-x-2">
      <Can permission="createBrands">
        <Button onClick={handleAddBrand} size="sm" className="h-8">
          <Plus className="mr-2 h-4 w-4" />
          Add Brand
        </Button>
      </Can>
    </div>
  )
}
