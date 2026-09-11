import { useState } from 'react'
import { Gauge } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useLanguage } from '@/context/language-context'

export interface StockThresholdValues {
  lowStockThreshold: number | null
  criticalStockThreshold: number | null
}

interface StockThresholdPopoverProps {
  lowStockThreshold?: number | null
  criticalStockThreshold?: number | null
  /** Store-wide defaults (from Low Stock Alert settings), shown as each field's placeholder
   *  so it's clear what applies when a field is left blank. */
  defaultLowStockThreshold: number
  defaultCriticalStockThreshold?: number | null
  onSave: (values: StockThresholdValues) => Promise<void> | void
  trigger?: React.ReactNode
  align?: 'start' | 'center' | 'end'
}

/** Popover to set/clear per-product Low Stock / Critical Stock overrides — mirrors
 *  FlagPickerPopover's shape (same Popover + Save/Clear pattern) so both row actions
 *  look and behave consistently. */
export function StockThresholdPopover({
  lowStockThreshold,
  criticalStockThreshold,
  defaultLowStockThreshold,
  defaultCriticalStockThreshold,
  onSave,
  trigger,
  align = 'end',
}: StockThresholdPopoverProps) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [low, setLow] = useState(lowStockThreshold != null ? String(lowStockThreshold) : '')
  const [critical, setCritical] = useState(criticalStockThreshold != null ? String(criticalStockThreshold) : '')
  const [saving, setSaving] = useState(false)

  const hasOverride = lowStockThreshold != null || criticalStockThreshold != null
  const defaultCritical = defaultCriticalStockThreshold ?? Math.floor(defaultLowStockThreshold / 2)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setLow(lowStockThreshold != null ? String(lowStockThreshold) : '')
      setCritical(criticalStockThreshold != null ? String(criticalStockThreshold) : '')
    }
  }

  const lowValue = low.trim() === '' ? null : Number(low)
  const criticalValue = critical.trim() === '' ? null : Number(critical)
  const effectiveLow = lowValue ?? defaultLowStockThreshold
  const effectiveCritical = criticalValue ?? defaultCritical
  const isInvalid = effectiveCritical > effectiveLow

  const handleSave = async () => {
    if (isInvalid) return
    setSaving(true)
    try {
      await onSave({ lowStockThreshold: lowValue, criticalStockThreshold: criticalValue })
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setSaving(true)
    try {
      await onSave({ lowStockThreshold: null, criticalStockThreshold: null })
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button variant='ghost' size='sm' className='h-8 gap-1.5 px-2'>
            <Gauge className='h-3.5 w-3.5' />
            {t('Stock Alert Levels')}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className='w-72 space-y-3' align={align}>
        <div className='space-y-1.5'>
          <p className='text-sm font-medium'>{t('Stock Alert Levels')}</p>
          <p className='text-xs text-muted-foreground'>
            {t('Set when this product shows as Low Stock or Critical Stock. Leave a field blank to use the store default.')}
          </p>
        </div>
        <div className='space-y-1.5'>
          <Label htmlFor='low-stock-threshold' className='text-xs font-medium text-muted-foreground'>
            {t('Low Stock Threshold')}
          </Label>
          <Input
            id='low-stock-threshold'
            type='number'
            min={0}
            inputMode='numeric'
            placeholder={`${t('Default')}: ${defaultLowStockThreshold}`}
            value={low}
            onChange={(e) => setLow(e.target.value)}
          />
        </div>
        <div className='space-y-1.5'>
          <Label htmlFor='critical-stock-threshold' className='text-xs font-medium text-muted-foreground'>
            {t('Critical Stock Threshold')}
          </Label>
          <Input
            id='critical-stock-threshold'
            type='number'
            min={0}
            inputMode='numeric'
            placeholder={`${t('Default')}: ${defaultCritical}`}
            value={critical}
            onChange={(e) => setCritical(e.target.value)}
          />
          {isInvalid && (
            <p className='text-xs text-destructive'>
              {t('Critical threshold cannot be higher than the low stock threshold.')}
            </p>
          )}
        </div>
        <div className='flex items-center justify-between gap-2 pt-1'>
          {hasOverride ? (
            <Button variant='outline' size='sm' disabled={saving} onClick={handleReset}>
              {t('Reset to default')}
            </Button>
          ) : <span />}
          <Button size='sm' disabled={saving || isInvalid} onClick={handleSave}>
            {t('Save')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
