import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ChevronDown } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import type { Branch } from '@/stores/branch.api'

interface SyncToBranchesOptionProps {
  /** The user's other branches. */
  targets: Branch[]
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** Which of `targets` to add to; null means all of them. */
  selectedIds: string[] | null
  onSelectedIdsChange: (ids: string[] | null) => void
  disabled?: boolean
}

/** "Also add to City Branch, Mall Branch" — short enough for a footer, exact enough to trust. */
function describeTargets(names: string[], t: (key: string, vars?: Record<string, string | number>) => string) {
  if (names.length <= 2) return names.join(', ')
  return t('{{first}}, {{second}} and {{count}} more', { first: names[0], second: names[1], count: names.length - 2 })
}

/**
 * The "add this product to my other branches too" checkbox on Add Product — ticked by
 * default, because in a multi-branch shop that is what nearly everyone wants. Only ever
 * shown when there IS another branch to add to. With several, a small picker narrows it
 * down (a warehouse, say, that should not sell it); the last branch cannot be unticked —
 * untick the main box instead.
 */
export function SyncToBranchesOption({ targets, checked, onCheckedChange, selectedIds, onSelectedIdsChange, disabled }: SyncToBranchesOptionProps) {
  const { t } = useLanguage()
  if (targets.length === 0) return null

  const chosen = selectedIds === null ? targets : targets.filter((branch) => selectedIds.includes(branch.id))
  const toggle = (branchId: string, on: boolean) => {
    const current = new Set(chosen.map((branch) => branch.id))
    if (on) current.add(branchId)
    else current.delete(branchId)
    if (current.size === 0) return
    onSelectedIdsChange(current.size === targets.length ? null : [...current])
  }

  return (
    <div className='flex items-start gap-2.5 text-left sm:mr-auto'>
      <Checkbox
        id='sync-to-branches'
        className='mt-0.5'
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onCheckedChange(next === true)}
      />
      <div className='min-w-0'>
        <Label htmlFor='sync-to-branches' className='cursor-pointer text-sm font-medium'>
          {t('Also add this product to my other branches')}
        </Label>
        <p className='flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground'>
          <span className='truncate'>
            {checked
              ? `${describeTargets(chosen.map((branch) => branch.name), t)} · ${t('stock starts at 0')}`
              : t('Only this branch will have it. You can sync it later from the Products page.')}
          </span>
          {checked && targets.length > 1 ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button type='button' variant='link' size='sm' className='h-auto gap-0.5 p-0 text-xs' disabled={disabled}>
                  {t('Choose')}
                  <ChevronDown className='h-3 w-3' />
                </Button>
              </PopoverTrigger>
              <PopoverContent align='start' className='w-64 space-y-1 p-2'>
                {targets.map((branch) => (
                  <Label key={branch.id} htmlFor={`sync-branch-${branch.id}`} className='flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 font-normal hover:bg-muted'>
                    <Checkbox
                      id={`sync-branch-${branch.id}`}
                      checked={chosen.some((c) => c.id === branch.id)}
                      onCheckedChange={(next) => toggle(branch.id, next === true)}
                    />
                    <span className='truncate text-sm'>{branch.name}</span>
                  </Label>
                ))}
              </PopoverContent>
            </Popover>
          ) : null}
        </p>
      </div>
    </div>
  )
}
