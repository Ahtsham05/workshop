import { useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import { Ban, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { usePermissions } from '@/context/permission-context'
import { useAppearance } from '@/context/appearance-context'
import {
  BRANCH_COLORS,
  BRANCH_TINT_LEVELS,
  type BranchColorKey,
  type BranchTintLevel,
} from '@/lib/appearance'
import { useGetBranchesQuery, useUpdateBranchMutation, type Branch } from '@/stores/branch.api'
import type { RootState } from '@/stores/store'

function BranchColorRow({
  branch,
  isActive,
  canEdit,
}: {
  branch: Branch
  isActive: boolean
  canEdit: boolean
}) {
  const [updateBranch, { isLoading }] = useUpdateBranchMutation()
  const current = (branch.appearance?.colorKey ?? '') as BranchColorKey

  const choose = async (colorKey: BranchColorKey) => {
    if (colorKey === current) return
    try {
      await updateBranch({ branchId: branch.id, body: { appearance: { colorKey } } }).unwrap()
      toast.success(colorKey ? `${branch.name} colour updated` : `${branch.name} colour cleared`)
    } catch {
      toast.error('Could not save the branch colour. Please try again.')
    }
  }

  return (
    <div className='space-y-2 rounded-lg border p-3'>
      <div className='flex items-center gap-2'>
        <span className='truncate text-sm font-medium'>{branch.name}</span>
        <Badge variant={branch.isDefault ? 'secondary' : 'outline'} className='shrink-0'>
          {branch.isDefault ? 'Main Branch' : 'Sub-Branch'}
        </Badge>
        {isActive && (
          <span className='text-muted-foreground shrink-0 text-xs'>currently open</span>
        )}
        {isLoading && <Loader2 className='text-muted-foreground ml-auto h-3.5 w-3.5 animate-spin' />}
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <button
          type='button'
          title='No colour'
          disabled={!canEdit || isLoading}
          onClick={() => choose('')}
          className={cn(
            'text-muted-foreground border-muted-foreground/40 flex h-7 w-7 items-center justify-center rounded-full border border-dashed transition-transform',
            canEdit && 'hover:scale-110',
            !current && 'ring-ring ring-offset-background ring-2 ring-offset-2',
            !canEdit && 'cursor-not-allowed opacity-60'
          )}
        >
          <Ban className='h-3.5 w-3.5' />
        </button>
        {BRANCH_COLORS.map((color) => (
          <button
            key={color.key}
            type='button'
            title={color.label}
            disabled={!canEdit || isLoading}
            onClick={() => choose(color.key)}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full transition-transform',
              canEdit && 'hover:scale-110',
              current === color.key && 'ring-ring ring-offset-background ring-2 ring-offset-2',
              !canEdit && 'cursor-not-allowed opacity-60'
            )}
            style={{ backgroundColor: color.hex }}
          >
            {current === color.key && <Check className='h-3.5 w-3.5 text-white drop-shadow' />}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Branch colours (shared by the whole organisation) and how strongly this user
 * wants them tinted into their own app.
 *
 * Giving the main branch and each sub-branch its own colour is the cheap way to
 * stop the expensive mistake: posting an invoice or a payment into the wrong
 * branch because every screen looks identical.
 */
export function BranchColorsSection() {
  const { preferences, setPreferences } = useAppearance()
  const { hasPermission } = usePermissions()
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const canEdit = hasPermission('manageBranches')

  const { data, isLoading } = useGetBranchesQuery({ limit: 100 })
  const branches = data?.results ?? []

  return (
    <section className='space-y-4'>
      <div>
        <h4 className='text-sm font-medium'>Branch colours</h4>
        <p className='text-muted-foreground text-sm'>
          Give the main branch and each sub-branch its own colour. The app background,
          cards and sidebar pick it up, so you can always tell which branch you are
          working in.
        </p>
      </div>

      <div className='space-y-2'>
        <Label>Tint strength</Label>
        <div className='flex flex-wrap gap-2'>
          {BRANCH_TINT_LEVELS.map((level) => (
            <Button
              key={level.key}
              type='button'
              size='sm'
              variant={preferences.branchTint === level.key ? 'default' : 'outline'}
              onClick={() => setPreferences({ branchTint: level.key as BranchTintLevel })}
            >
              {level.label}
            </Button>
          ))}
        </div>
        <p className='text-muted-foreground text-xs'>
          {BRANCH_TINT_LEVELS.find((l) => l.key === preferences.branchTint)?.description}{' '}
          This setting is yours alone — it does not change what your colleagues see.
        </p>
      </div>

      <div className='space-y-2'>
        <Label>Colour per branch</Label>
        {!canEdit && (
          <p className='text-muted-foreground text-xs'>
            Only users who can manage branches may change these colours.
          </p>
        )}
        {isLoading ? (
          <div className='text-muted-foreground flex items-center gap-2 p-3 text-sm'>
            <Loader2 className='h-4 w-4 animate-spin' /> Loading branches…
          </div>
        ) : branches.length === 0 ? (
          <p className='text-muted-foreground text-sm'>No branches to configure yet.</p>
        ) : (
          <div className='space-y-2'>
            {branches.map((branch) => (
              <BranchColorRow
                key={branch.id}
                branch={branch}
                isActive={branch.id === activeBranchId}
                canEdit={canEdit}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
