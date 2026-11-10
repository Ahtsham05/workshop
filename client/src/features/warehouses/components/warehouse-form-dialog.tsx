import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useLanguage } from '@/context/language-context'
import { getErrorMessage } from '@/lib/get-error-message'
import { useManufacturingAccess } from '@/hooks/use-manufacturing-access'
import { cn } from '@/lib/utils'
import { useCreateWarehouseMutation, useUpdateWarehouseMutation, type Warehouse, type WarehouseType } from '@/stores/warehouse.api'
import { WAREHOUSE_COLORS, WAREHOUSE_TYPE_LABELS } from '../lib/labels'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Editing this warehouse; omitted = new warehouse. */
  warehouse?: Warehouse | null
  onSaved?: (w: Warehouse) => void
}

const EMPTY = {
  name: '',
  code: '',
  type: 'store' as WarehouseType,
  description: '',
  address: '',
  city: '',
  phone: '',
  color: 'emerald',
  allowSales: true,
  allowReceipts: true,
  isDefault: false,
  isMaterialsStore: false,
  isGoodsStore: false,
}

export function WarehouseFormDialog({ open, onOpenChange, warehouse, onSaved }: Props) {
  const { t } = useLanguage()
  const [form, setForm] = useState(EMPTY)
  const [create, { isLoading: creating }] = useCreateWarehouseMutation()
  const [update, { isLoading: updating }] = useUpdateWarehouseMutation()
  const saving = creating || updating
  const { available: manufacturingOn } = useManufacturingAccess()

  useEffect(() => {
    if (!open) return
    setForm(
      warehouse
        ? {
            name: warehouse.name,
            code: warehouse.code,
            type: warehouse.type,
            description: warehouse.description || '',
            address: warehouse.address || '',
            city: warehouse.city || '',
            phone: warehouse.phone || '',
            color: warehouse.color || 'blue',
            allowSales: warehouse.allowSales !== false,
            allowReceipts: warehouse.allowReceipts !== false,
            isDefault: warehouse.isDefault,
            isMaterialsStore: Boolean(warehouse.isMaterialsStore),
            isGoodsStore: Boolean(warehouse.isGoodsStore),
          }
        : EMPTY
    )
  }, [open, warehouse])

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [key]: value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error(t('Give the warehouse a name'))
      return
    }
    try {
      const body = { ...form, name: form.name.trim(), code: form.code.trim() }
      const saved = warehouse ? await update({ id: warehouse.id, body }).unwrap() : await create(body).unwrap()
      toast.success(warehouse ? t('Warehouse updated') : t('Warehouse created'))
      onSaved?.(saved)
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not save the warehouse')))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[92vh] flex-col max-w-xl sm:max-w-xl'>
        <DialogHeader className='shrink-0'>
          <DialogTitle>{warehouse ? t('Edit warehouse') : t('New warehouse')}</DialogTitle>
          <DialogDescription>
            {t('A place where stock is kept: a store room, the shop floor, a godown, a returns area. Add as many as you need.')}
          </DialogDescription>
        </DialogHeader>
        <form id='warehouse-form' onSubmit={submit} className='min-h-0 flex-1 space-y-4 overflow-y-auto px-1'>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]'>
            <div className='space-y-1.5'>
              <Label htmlFor='wh-name'>{t('Name')}</Label>
              <Input id='wh-name' autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={t('e.g. Back Store, Godown 2')} />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='wh-code'>{t('Short code')}</Label>
              <Input
                id='wh-code'
                value={form.code}
                maxLength={12}
                onChange={(e) => set('code', e.target.value.toUpperCase())}
                placeholder={t('Auto')}
                className='font-mono uppercase'
              />
            </div>
          </div>

          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <div className='space-y-1.5'>
              <Label>{t('Type')}</Label>
              <Select value={form.type} onValueChange={(v) => set('type', v as WarehouseType)}>
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(WAREHOUSE_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {t(label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1.5'>
              <Label>{t('Colour')}</Label>
              <div className='flex h-9 flex-wrap items-center gap-1.5'>
                {Object.entries(WAREHOUSE_COLORS).map(([key, c]) => (
                  <button
                    key={key}
                    type='button'
                    aria-label={key}
                    onClick={() => set('color', key)}
                    className={cn(
                      'h-6 w-6 rounded-full ring-offset-2 ring-offset-background transition',
                      c.dot,
                      form.color === key ? 'ring-2 ring-foreground' : 'opacity-70 hover:opacity-100'
                    )}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <div className='space-y-1.5'>
              <Label htmlFor='wh-address'>{t('Address')}</Label>
              <Input id='wh-address' value={form.address} onChange={(e) => set('address', e.target.value)} />
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1.5'>
                <Label htmlFor='wh-city'>{t('City')}</Label>
                <Input id='wh-city' value={form.city} onChange={(e) => set('city', e.target.value)} />
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='wh-phone'>{t('Phone')}</Label>
                <Input id='wh-phone' value={form.phone} onChange={(e) => set('phone', e.target.value)} />
              </div>
            </div>
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='wh-desc'>{t('Notes')}</Label>
            <Textarea id='wh-desc' rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
          </div>

          <div className='space-y-3 rounded-lg border p-3'>
            <ToggleRow
              label={t('Can sell from here')}
              hint={t('Invoices can deliver goods from this warehouse.')}
              checked={form.allowSales}
              onChange={(v) => set('allowSales', v)}
            />
            <ToggleRow
              label={t('Can receive purchases')}
              hint={t('Purchases can be received into this warehouse.')}
              checked={form.allowReceipts}
              onChange={(v) => set('allowReceipts', v)}
            />
            <ToggleRow
              label={t('Default warehouse')}
              hint={t('Sales, purchases, returns and adjustments that name no warehouse use the default. Changing it moves no stock.')}
              checked={form.isDefault}
              disabled={Boolean(warehouse?.isDefault)}
              onChange={(v) => set('isDefault', v)}
            />
            {manufacturingOn ? (
              <>
                <ToggleRow
                  label={t('Production: materials store')}
                  hint={t('Manufacturing issues raw materials from here and returns unused ones here. One per branch.')}
                  checked={form.isMaterialsStore}
                  onChange={(v) => set('isMaterialsStore', v)}
                />
                <ToggleRow
                  label={t('Production: finished goods store')}
                  hint={t('Finished goods, packing and production scrap go through here. One per branch.')}
                  checked={form.isGoodsStore}
                  onChange={(v) => set('isGoodsStore', v)}
                />
              </>
            ) : null}
          </div>
        </form>
        <DialogFooter className='shrink-0'>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button type='submit' form='warehouse-form' disabled={saving}>
            {saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {warehouse ? t('Save changes') : t('Create warehouse')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ToggleRow({ label, hint, checked, onChange, disabled }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className='flex items-start justify-between gap-4'>
      <div className='space-y-0.5'>
        <p className='text-sm font-medium'>{label}</p>
        <p className='text-xs text-muted-foreground'>{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  )
}
