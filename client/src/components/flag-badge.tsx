import { useState } from 'react'
import { Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ColorSwatchPicker } from '@/components/color-swatch-picker'
import { cn } from '@/lib/utils'

export interface EntityFlag {
  color: string
  reason?: string
  note?: string
  flaggedAt?: string
  flaggedBy?: { name?: string; email?: string } | string | null
}

/** Small colored flag icon with a tooltip showing why it was flagged — read-only, for
 *  table cells/rows. Internal-use marker only; never rendered on customer-facing prints. */
export function FlagBadge({ flag, className }: { flag?: EntityFlag | null; className?: string }) {
  if (!flag) return null
  const label = [flag.reason, flag.note].filter(Boolean).join(' — ') || 'Flagged for review'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Flag
          className={cn('h-3.5 w-3.5 flex-shrink-0', className)}
          style={{ color: flag.color, fill: flag.color }}
        />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

interface FlagPickerPopoverProps {
  flag?: EntityFlag | null
  /** Save a new/updated flag. */
  onSave: (data: { color: string; reason: string; note: string }) => Promise<void> | void
  /** Clear the existing flag. */
  onClear: () => Promise<void> | void
  trigger?: React.ReactNode
  align?: 'start' | 'center' | 'end'
}

/** Popover to set/clear a discrepancy flag — shared by Product row actions and Invoice
 *  row actions so "flag for review" looks and behaves identically everywhere. */
export function FlagPickerPopover({ flag, onSave, onClear, trigger, align = 'end' }: FlagPickerPopoverProps) {
  const [open, setOpen] = useState(false)
  const [color, setColor] = useState(flag?.color ?? '#ef4444')
  const [reason, setReason] = useState(flag?.reason ?? '')
  const [note, setNote] = useState(flag?.note ?? '')
  const [saving, setSaving] = useState(false)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setColor(flag?.color ?? '#ef4444')
      setReason(flag?.reason ?? '')
      setNote(flag?.note ?? '')
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({ color, reason, note })
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    setSaving(true)
    try {
      await onClear()
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
            <Flag
              className='h-3.5 w-3.5'
              style={flag ? { color: flag.color, fill: flag.color } : undefined}
            />
            {flag ? 'Flagged' : 'Flag'}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className='w-80 space-y-3' align={align}>
        <div className='space-y-1.5'>
          <p className='text-sm font-medium'>{flag ? 'Update flag' : 'Flag for review'}</p>
          <p className='text-xs text-muted-foreground'>
            Mark a discrepancy that needs staff attention. Visible only in internal views — never on customer prints.
          </p>
        </div>
        <div className='space-y-1.5'>
          <label className='text-xs font-medium text-muted-foreground'>Color</label>
          <ColorSwatchPicker value={color} onChange={(hex) => setColor(hex ?? '#ef4444')} />
        </div>
        <div className='space-y-1.5'>
          <label className='text-xs font-medium text-muted-foreground'>Reason</label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder='e.g. Price mismatch, wrong stock count...'
          />
        </div>
        <div className='space-y-1.5'>
          <label className='text-xs font-medium text-muted-foreground'>Note (optional)</label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            showVoiceInput={false}
            className='min-h-16 text-sm'
            placeholder='Details for whoever resolves this...'
          />
        </div>
        <div className='flex items-center justify-between gap-2 pt-1'>
          {flag ? (
            <Button variant='outline' size='sm' disabled={saving} onClick={handleClear}>
              Clear flag
            </Button>
          ) : <span />}
          <Button size='sm' disabled={saving || !reason.trim()} onClick={handleSave}>
            {flag ? 'Update' : 'Save flag'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
