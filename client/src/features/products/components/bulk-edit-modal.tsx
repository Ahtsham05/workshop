import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLanguage } from '@/context/language-context'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface BulkEditModalProps {
  isOpen: boolean
  onClose: () => void
  selectedProducts: any[]
  onSave: (updates: { price?: number; cost?: number; stockQuantity?: number }) => Promise<void>
}

export function BulkEditModal({ isOpen, onClose, selectedProducts, onSave }: BulkEditModalProps) {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    price: '',
    cost: '',
    stockQuantity: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.price && !formData.cost && !formData.stockQuantity) {
      toast.error(t('enter_at_least_one_value'))
      return
    }

    setLoading(true)

    try {
      const updates: any = {}
      
      if (formData.price) updates.price = parseFloat(formData.price)
      if (formData.cost) updates.cost = parseFloat(formData.cost)
      if (formData.stockQuantity) updates.stockQuantity = parseInt(formData.stockQuantity)

      await onSave(updates)
      
      toast.success(t('bulk_update_success').replace('{count}', selectedProducts.length.toString()))
      onClose()
      setFormData({ price: '', cost: '', stockQuantity: '' })
    } catch (error) {
      console.error('Bulk edit error:', error)
      toast.error('Failed to update products')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    onClose()
    setFormData({ price: '', cost: '', stockQuantity: '' })
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('bulk_edit_products')}</DialogTitle>
          <DialogDescription>
            {t('edit_selected_products').replace('{count}', selectedProducts.length.toString())}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="price">{t('price')}</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              placeholder={t('enter_new_price')}
              value={formData.price}
              onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cost">{t('cost')}</Label>
            <Input
              id="cost"
              type="number"
              step="0.01"
              placeholder={t('enter_new_cost')}
              value={formData.cost}
              onChange={(e) => setFormData(prev => ({ ...prev, cost: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="stockQuantity">{t('stock_quantity')}</Label>
            <Input
              id="stockQuantity"
              type="number"
              placeholder={t('enter_new_quantity')}
              value={formData.stockQuantity}
              onChange={(e) => setFormData(prev => ({ ...prev, stockQuantity: e.target.value }))}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('update_products')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
