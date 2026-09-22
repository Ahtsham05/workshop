import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface Props {
  minAmount?: number
  maxAmount?: number
  onChange: (range: { minAmount?: number; maxAmount?: number }) => void
  className?: string
}

/** "Filters" button — currently just an amount range, but its own popover so more filters can
 *  land here later without crowding the always-visible search/date/account/type row. Shared by
 *  any list filter bar that needs a min/max amount range. */
export function AmountRangeFilter({ minAmount, maxAmount, onChange, className }: Props) {
  const [open, setOpen] = useState(false)
  const [min, setMin] = useState(minAmount != null ? String(minAmount) : '')
  const [max, setMax] = useState(maxAmount != null ? String(maxAmount) : '')
  const active = minAmount != null || maxAmount != null

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setMin(minAmount != null ? String(minAmount) : '')
      setMax(maxAmount != null ? String(maxAmount) : '')
    }
    setOpen(next)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant='outline' className={cn('relative h-9 gap-2', className)}>
          <SlidersHorizontal className='h-4 w-4' />
          Filters
          {active && <span className='absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary' aria-hidden />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-72 p-4'>
        <p className='mb-3 text-sm font-medium'>Amount range</p>
        <div className='grid grid-cols-2 gap-2'>
          <div className='space-y-1'>
            <Label className='text-xs text-muted-foreground'>Min</Label>
            <Input type='number' min={0} inputMode='decimal' value={min} onChange={(e) => setMin(e.target.value)} placeholder='0' />
          </div>
          <div className='space-y-1'>
            <Label className='text-xs text-muted-foreground'>Max</Label>
            <Input type='number' min={0} inputMode='decimal' value={max} onChange={(e) => setMax(e.target.value)} placeholder='Any' />
          </div>
        </div>
        <div className='mt-4 flex justify-end gap-2'>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => {
              setMin('')
              setMax('')
              onChange({ minAmount: undefined, maxAmount: undefined })
              setOpen(false)
            }}
          >
            Clear
          </Button>
          <Button
            size='sm'
            onClick={() => {
              const minVal = min.trim() === '' ? undefined : Number(min)
              const maxVal = max.trim() === '' ? undefined : Number(max)
              onChange({ minAmount: minVal, maxAmount: maxVal })
              setOpen(false)
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
