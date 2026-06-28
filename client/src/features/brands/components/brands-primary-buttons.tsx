import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { useBrands } from '../context/brands-context'

export default function BrandsPrimaryButtons() {
  const { dispatch } = useBrands()

  const handleAddBrand = () => {
    dispatch({ type: 'SET_BRAND', payload: null })
    dispatch({ type: 'SET_OPEN', payload: true })
  }

  return (
    <div className="flex items-center space-x-2">
      <Button onClick={handleAddBrand} size="sm" className="h-8">
        <Plus className="mr-2 h-4 w-4" />
        Add Brand
      </Button>
    </div>
  )
}
