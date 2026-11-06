import { useMemo, useState } from 'react'
import { Check, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { useUpdateRepairSettingsMutation } from '@/stores/mobile-shop.api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Category names that usually hold repair spares — pre-ticked the first time. */
const LIKELY_PART =
  /part|spare|repair|display|lcd|oled|screen|panel|touch|glass|batter|charg|port|flex|ic\b|chip|board|speaker|mic|camera|keyboard|hinge|fan|ram|ssd|hdd|storage|adapter|cable|toner|cartridge|backlight/i

/**
 * Pick which product categories are repair spare parts — shop-wide. The repair job's
 * "Part from stock" list then shows only these.
 */
export function PartCategoriesSetup({
  available,
  current,
  firstTime,
  onDone,
  onSkip,
}: {
  /** Category name → number of in-catalog products. */
  available: Map<string, number>
  current: string[]
  firstTime: boolean
  onDone: () => void
  onSkip?: () => void
}) {
  const [filter, setFilter] = useState('')
  const [picked, setPicked] = useState<string[]>(() =>
    current.length
      ? current
      : [...available.keys()].filter((n) => LIKELY_PART.test(n))
  )
  const [save, { isLoading }] = useUpdateRepairSettingsMutation()
  const sorted = useMemo(
    () =>
      [...available.entries()]
        .filter(
          ([n]) =>
            !filter.trim() ||
            n.toLowerCase().includes(filter.trim().toLowerCase())
        )
        .sort(
          (a, b) =>
            Number(picked.includes(b[0])) - Number(picked.includes(a[0])) ||
            b[1] - a[1] ||
            a[0].localeCompare(b[0])
        ),
    [available, filter, picked]
  )
  const lower = new Set(picked.map((p) => p.toLowerCase()))
  const toggle = (n: string) =>
    setPicked((p) =>
      lower.has(n.toLowerCase())
        ? p.filter((x) => x.toLowerCase() !== n.toLowerCase())
        : [...p, n]
    )

  const submit = async () => {
    if (!picked.length) return toast.error('Tick at least one category')
    try {
      await save({ partCategories: picked }).unwrap()
      toast.success('Repair part categories saved')
      onDone()
    } catch (e) {
      toast.error(
        (e as { data?: { message?: string } })?.data?.message ||
          'Could not save'
      )
    }
  }

  return (
    <div className='space-y-3 rounded-lg border p-3'>
      <div>
        <div className='flex items-center gap-1.5 text-sm font-semibold'>
          <Settings2 className='h-4 w-4' aria-hidden /> Which categories are
          repair parts?
        </div>
        <p className='text-muted-foreground text-xs'>
          {firstTime ? 'One-time setup for the whole shop. ' : ''}Only products
          in these categories are offered as parts. Likely ones are ticked for
          you.
        </p>
      </div>
      {available.size > 10 && (
        <Input
          placeholder='Filter categories…'
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className='h-8'
          showVoiceInput={false}
        />
      )}
      {available.size === 0 ? (
        <p className='text-muted-foreground text-sm'>
          Your products have no categories yet. Add a category such as “Spare
          Parts” to your repair parts first.
        </p>
      ) : (
        <div className='flex max-h-48 flex-wrap gap-1.5 overflow-y-auto'>
          {sorted.map(([n, count]) => {
            const on = lower.has(n.toLowerCase())
            return (
              <button
                key={n}
                type='button'
                aria-pressed={on}
                onClick={() => toggle(n)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium',
                  on
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {on && <Check className='h-3 w-3' aria-hidden />}
                {n} <span className='opacity-70'>({count})</span>
              </button>
            )
          })}
        </div>
      )}
      <div className='flex flex-wrap items-center justify-end gap-2'>
        {onSkip && (
          <Button type='button' size='sm' variant='ghost' onClick={onSkip}>
            {firstTime ? 'Skip — show all products' : 'Cancel'}
          </Button>
        )}
        <Button
          type='button'
          size='sm'
          disabled={isLoading || available.size === 0}
          onClick={submit}
        >
          {isLoading ? 'Saving…' : `Save (${picked.length})`}
        </Button>
      </div>
    </div>
  )
}
