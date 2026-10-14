import { useState } from 'react'
import { toast } from 'sonner'
import {
  useGetBomsQuery,
  useUpdateManufacturingProductMutation,
  type ManufacturingProduct,
  type ProcurementType,
  type ProductType,
} from '@/stores/manufacturing.api'
import { getErrorMessage } from '@/lib/get-error-message'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  PROCUREMENT_LABELS,
  PRODUCT_TYPES,
  PRODUCT_TYPE_META,
  fmtQty,
} from '../lib/constants'
import { Field } from './page'

const NONE = '__none__'

/** Manufacturing attributes of one catalog product: type, procurement, lead time, default BOM. */
export function ProductAttributesSheet({
  product,
  onClose,
}: {
  product: ManufacturingProduct
  onClose: () => void
}) {
  const { t } = useLanguage()
  const [productType, setProductType] = useState<string>(
    product.productType || NONE
  )
  const [procurement, setProcurement] = useState<string>(
    product.procurementType || NONE
  )
  const [leadTime, setLeadTime] = useState<string>(
    product.manufacturingLeadTimeDays?.toString() ?? ''
  )
  const [defaultBomId, setDefaultBomId] = useState<string>(
    product.defaultBomId || NONE
  )
  const { data: boms } = useGetBomsQuery({
    productId: product.id,
    isActive: true,
    limit: 50,
  })
  const [update, { isLoading }] = useUpdateManufacturingProductMutation()

  const save = async () => {
    try {
      await update({
        productId: product.id,
        productType: productType === NONE ? null : (productType as ProductType),
        procurementType:
          procurement === NONE ? null : (procurement as ProcurementType),
        manufacturingLeadTimeDays: leadTime === '' ? null : Number(leadTime),
        ...(defaultBomId !== (product.defaultBomId || NONE)
          ? { defaultBomId: defaultBomId === NONE ? null : defaultBomId }
          : {}),
      }).unwrap()
      toast.success(t('Manufacturing attributes saved'))
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err, t('Failed to save')))
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className='flex w-full flex-col gap-0 sm:max-w-md'>
        <SheetHeader className='border-b px-5 py-4'>
          <SheetTitle>{product.name}</SheetTitle>
          <SheetDescription>
            {t(
              'Manufacturing attributes. Everything else about this product stays as it is.'
            )}
          </SheetDescription>
        </SheetHeader>
        <div className='grid flex-1 content-start gap-5 overflow-y-auto px-5 py-5'>
          <dl className='bg-muted/40 grid grid-cols-3 gap-3 rounded-lg border px-3 py-2.5'>
            <Field label={t('SKU')}>{product.sku || '—'}</Field>
            <Field label={t('On hand')}>
              {fmtQty(product.stockQuantity)} {product.unit}
            </Field>
            <Field label={t('BOMs')}>{product.bomCount}</Field>
          </dl>
          <div className='grid gap-1.5'>
            <Label>{t('Product type')}</Label>
            <Select value={productType} onValueChange={setProductType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('Not classified')}</SelectItem>
                {PRODUCT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(PRODUCT_TYPE_META[type].label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div className='grid gap-1.5'>
              <Label>{t('Procurement')}</Label>
              <Select value={procurement} onValueChange={setProcurement}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {(Object.keys(PROCUREMENT_LABELS) as ProcurementType[]).map(
                    (p) => (
                      <SelectItem key={p} value={p}>
                        {t(PROCUREMENT_LABELS[p])}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className='grid gap-1.5'>
              <Label>{t('Lead time (days)')}</Label>
              <Input
                type='number'
                min={0}
                value={leadTime}
                onChange={(e) => setLeadTime(e.target.value)}
              />
            </div>
          </div>
          <div className='grid gap-1.5'>
            <Label>{t('Default BOM')}</Label>
            <Select
              value={defaultBomId}
              onValueChange={setDefaultBomId}
              disabled={!boms?.results.length}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('No active BOM')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('None')}</SelectItem>
                {boms?.results.map((bom) => (
                  <SelectItem key={bom.id} value={bom.id}>
                    {bom.bomNumber} · v{bom.version}{' '}
                    {bom.name ? `— ${bom.name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <SheetFooter className='flex-row justify-end border-t px-5 py-3'>
          <Button variant='outline' onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button onClick={save} disabled={isLoading}>
            {t('Save changes')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
