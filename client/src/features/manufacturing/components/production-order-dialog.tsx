import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  useCreateProductionOrderMutation,
  useGetBomsQuery,
  useGetManufacturingSettingsQuery,
  useUpdateProductionOrderMutation,
  type ProductionOrder,
  type ProductionPriority,
} from '@/stores/manufacturing.api'
import { getErrorMessage } from '@/lib/get-error-message'
import { useLanguage } from '@/context/language-context'
import { useBranchName } from '@/hooks/use-branch-name'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PRIORITIES, PRIORITY_META, fmtQty } from '../lib/constants'
import { ProductPicker } from './product-picker'

const toDateInput = (value?: string | null) =>
  value ? new Date(value).toISOString().slice(0, 10) : ''
const NONE = '__none__'

/** Create a production order, or edit one (recipe fields lock once it's released). */
export function ProductionOrderDialog({
  order,
  onClose,
  onSaved,
}: {
  order?: ProductionOrder | null
  onClose: () => void
  onSaved?: (order: ProductionOrder) => void
}) {
  const { t } = useLanguage()
  const branchName = useBranchName()
  const { data: settings } = useGetManufacturingSettingsQuery()
  const recipeEditable =
    !order || order.status === 'draft' || order.status === 'planned'

  const [product, setProduct] = useState<{
    id: string
    name: string
    unit?: string
    defaultBomId?: string | null
    stockQuantity?: number
  } | null>(
    order
      ? { id: order.productId, name: order.productName, unit: order.unit }
      : null
  )
  const [bomId, setBomId] = useState<string>(order?.bomId || NONE)
  const [quantity, setQuantity] = useState(
    order ? String(order.plannedQuantity) : ''
  )
  const [start, setStart] = useState(toDateInput(order?.plannedStartDate))
  const [end, setEnd] = useState(toDateInput(order?.plannedCompletionDate))
  const [priority, setPriority] = useState<ProductionPriority>(
    order?.priority || 'normal'
  )
  const [sourceLocation, setSourceLocation] = useState(
    order?.sourceLocation ?? ''
  )
  const [wipLocation, setWipLocation] = useState(order?.wipLocation ?? '')
  const [fgLocation, setFgLocation] = useState(
    order?.finishedGoodsLocation ?? ''
  )
  const [notes, setNotes] = useState(order?.notes || '')

  // New orders start from the org's default locations/priority.
  useEffect(() => {
    if (order || !settings) return
    setSourceLocation((v) => v || settings.defaultSourceLocation)
    setWipLocation((v) => v || settings.defaultWipLocation)
    setFgLocation((v) => v || settings.defaultFinishedGoodsLocation)
    setPriority(settings.defaultPriority)
  }, [settings, order])

  const { data: boms } = useGetBomsQuery(
    { productId: product?.id, isActive: true, limit: 50 },
    { skip: !product }
  )
  const [create, { isLoading: creating }] = useCreateProductionOrderMutation()
  const [update, { isLoading: updating }] = useUpdateProductionOrderMutation()

  const save = async (status?: 'draft' | 'planned') => {
    if (!product) return toast.error(t('Choose the product to produce'))
    if (!(Number(quantity) > 0))
      return toast.error(t('Planned quantity must be greater than zero'))
    const body = {
      ...(recipeEditable
        ? {
            productId: product.id,
            bomId: bomId === NONE ? null : bomId,
            plannedQuantity: Number(quantity),
          }
        : {}),
      plannedStartDate: start || null,
      plannedCompletionDate: end || null,
      priority,
      sourceLocation,
      wipLocation,
      finishedGoodsLocation: fgLocation,
      notes,
    }
    try {
      const saved = order
        ? await update({ orderId: order.id, ...body }).unwrap()
        : await create({
            ...body,
            productId: product.id,
            plannedQuantity: Number(quantity),
            status,
          }).unwrap()
      toast.success(
        order
          ? t('Production order updated')
          : t('Production order {{n}} created').replace(
              '{{n}}',
              saved.orderNumber
            )
      )
      onSaved?.(saved)
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err, t('Failed to save production order')))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {order
              ? `${t('Edit')} ${order.orderNumber}`
              : t('New production order')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Materials are issued from, and output received into, this branch’s stock'
            )}
            {branchName ? ` (${branchName})` : ''}.
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-4 md:grid-cols-6'>
          <div className='grid gap-1.5 md:col-span-4'>
            <Label>{t('Product')}</Label>
            <ProductPicker
              value={product}
              disabled={!recipeEditable}
              onChange={(p) => {
                setProduct(p)
                setBomId(p.defaultBomId || NONE)
              }}
            />
          </div>
          <div className='grid gap-1.5 md:col-span-2'>
            <Label>{t('Planned quantity')}</Label>
            <div className='relative'>
              <Input
                type='number'
                min={0}
                step='any'
                value={quantity}
                disabled={!recipeEditable}
                onChange={(e) => setQuantity(e.target.value)}
                className='pr-12'
              />
              <span className='text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs'>
                {product?.unit}
              </span>
            </div>
          </div>
          <div className='grid gap-1.5 md:col-span-4'>
            <Label>{t('Bill of materials')}</Label>
            <Select
              value={bomId}
              onValueChange={setBomId}
              disabled={!recipeEditable || !product}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('Select BOM')} />
              </SelectTrigger>
              <SelectContent>
                {!settings?.requireBomForProduction && (
                  <SelectItem value={NONE}>{t('No BOM')}</SelectItem>
                )}
                {boms?.results.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.bomNumber} · v{b.version}
                    {b.isDefault ? ` · ${t('default')}` : ''} —{' '}
                    {fmtQty(b.quantity)} {b.unit}, {b.components.length}{' '}
                    {t('components')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {product && boms && boms.results.length === 0 && (
              <p className='text-xs text-amber-600 dark:text-amber-400'>
                {t(
                  'This product has no active BOM yet — create one under Bills of Materials.'
                )}
              </p>
            )}
          </div>
          <div className='grid gap-1.5 md:col-span-2'>
            <Label>{t('Priority')}</Label>
            <Select
              value={priority}
              onValueChange={(v) => setPriority(v as ProductionPriority)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(PRIORITY_META[p].label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='grid gap-1.5 md:col-span-3'>
            <Label>{t('Planned start')}</Label>
            <Input
              type='date'
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className='grid gap-1.5 md:col-span-3'>
            <Label>{t('Planned completion')}</Label>
            <Input
              type='date'
              value={end}
              min={start || undefined}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
          <div className='grid gap-1.5 md:col-span-2'>
            <Label>{t('Source location')}</Label>
            <Input
              value={sourceLocation}
              onChange={(e) => setSourceLocation(e.target.value)}
            />
          </div>
          <div className='grid gap-1.5 md:col-span-2'>
            <Label>{t('WIP location')}</Label>
            <Input
              value={wipLocation}
              onChange={(e) => setWipLocation(e.target.value)}
            />
          </div>
          <div className='grid gap-1.5 md:col-span-2'>
            <Label>{t('Finished goods location')}</Label>
            <Input
              value={fgLocation}
              onChange={(e) => setFgLocation(e.target.value)}
            />
          </div>
          <div className='grid gap-1.5 md:col-span-6'>
            <Label>{t('Notes')}</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className='gap-2'>
          <Button variant='outline' onClick={onClose}>
            {t('Cancel')}
          </Button>
          {order ? (
            <Button onClick={() => save()} disabled={updating}>
              {t('Save changes')}
            </Button>
          ) : (
            <>
              <Button
                variant='secondary'
                onClick={() => save('draft')}
                disabled={creating}
              >
                {t('Save as draft')}
              </Button>
              <Button onClick={() => save('planned')} disabled={creating}>
                {t('Create & plan')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
