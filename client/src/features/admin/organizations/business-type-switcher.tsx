import toast from 'react-hot-toast'
import { Check, ChevronDown, Loader2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BUSINESS_TYPE_OPTIONS, getHiddenModules, normalizeBusinessType } from '@/lib/business-types'
import { cn } from '@/lib/utils'
import { billingErrorMessage } from '@/stores/billing.api'
import { useAdminSetBusinessTypeMutation } from '@/stores/admin-leads.api'

const labelOf = (value: string) =>
  BUSINESS_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value

const MODULE_NAMES: Record<string, string> = {
  hr: 'HR & payroll',
  branches: 'branches',
  salesmen: 'salesmen',
  communications: 'communications',
}

/** Short note under a type in the menu, e.g. "Hides HR & payroll, branches…". */
const hiddenNote = (value: string) => {
  const hidden = getHiddenModules(value)
  return hidden.length ? `Hides ${hidden.map((m) => MODULE_NAMES[m] ?? m).join(', ')}` : null
}

/**
 * One-click business type switch for an organization in the admin list. Picking a type
 * applies it at once (org + all its users) and offers Undo; no business data changes.
 * Every click is stopped from reaching the row, which would otherwise open the org.
 */
export function BusinessTypeSwitcher({
  orgId,
  orgName,
  businessType,
  className,
}: {
  orgId: string
  orgName: string
  businessType?: string | null
  className?: string
}) {
  const current = normalizeBusinessType(businessType)
  const [setBusinessType, { isLoading }] = useAdminSetBusinessTypeMutation()

  const apply = async (next: string, { undoTo }: { undoTo?: string } = {}) => {
    try {
      const res = await setBusinessType({ orgId, businessType: next }).unwrap()
      if (undoTo !== undefined) {
        toast.success(`${orgName} is back to ${labelOf(next)}`)
        return
      }
      const previous = normalizeBusinessType(res.previousBusinessType)
      toast.success(
        (t) => (
          <span className='flex items-center gap-3 text-sm'>
            <span>
              <b>{orgName}</b> is now <b>{labelOf(next)}</b>
            </span>
            <button
              type='button'
              className='rounded border px-2 py-0.5 text-xs font-medium hover:bg-muted'
              onClick={() => {
                toast.dismiss(t.id)
                void apply(previous, { undoTo: previous })
              }}
            >
              Undo
            </button>
          </span>
        ),
        { duration: 8000 },
      )
    } catch (err) {
      toast.error(billingErrorMessage(err, 'Could not change the business type'))
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          disabled={isLoading}
          onClick={(e) => e.stopPropagation()}
          title='Change business type'
          className={cn(
            'inline-flex max-w-full items-center gap-0.5 rounded px-1 -mx-1 text-xs text-muted-foreground',
            'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
        >
          <span className='truncate'>{labelOf(current)}</span>
          {isLoading ? <Loader2 className='size-3 shrink-0 animate-spin' /> : <ChevronDown className='size-3 shrink-0 opacity-60' />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' className='w-64' onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className='text-xs font-normal text-muted-foreground'>
          Change business type — applies to all users
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {BUSINESS_TYPE_OPTIONS.map((option) => {
          const selected = option.value === current
          const note = hiddenNote(option.value)
          return (
            <DropdownMenuItem
              key={option.value}
              disabled={selected}
              onSelect={() => void apply(option.value)}
              className='items-start gap-2'
            >
              <Check className={cn('mt-0.5 size-3.5 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />
              <span className='min-w-0'>
                <span className='block text-sm'>{option.label}</span>
                {note && <span className='block text-[11px] text-muted-foreground'>{note}</span>}
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
