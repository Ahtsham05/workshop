import { useSelector } from 'react-redux'
import { GitBranch } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useGetMyBranchesQuery } from '@/stores/branch.api'
import { RootState } from '@/stores/store'
import { branchColorHex } from '@/lib/appearance'

/**
 * Persistent "which branch am I in" indicator shown in the top header on every
 * page. The sidebar's branch switcher can be collapsed or scrolled out of view,
 * so this gives a fixed, always-visible reference point.
 *
 * When the branch has a colour (Settings → Appearance), the chip wears it — the
 * same colour that tints the rest of the app, so the two reinforce each other.
 */
export function BranchIndicator() {
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const activeBranchName = useSelector((state: RootState) => state.auth.activeBranchName)
  const { data: branches = [] } = useGetMyBranchesQuery(undefined)

  if (!activeBranchName) return null

  const activeBranch = branches.find((b) => b.id === activeBranchId)
  const isMain = activeBranch?.isDefault ?? false
  const colorHex = branchColorHex(activeBranch?.appearance?.colorKey)

  return (
    <div
      className="flex items-center gap-2 min-w-0 h-9 px-2.5 rounded-md border bg-muted/40"
      style={
        colorHex
          ? {
              borderColor: `color-mix(in oklab, ${colorHex} 45%, transparent)`,
              backgroundColor: `color-mix(in oklab, ${colorHex} 12%, transparent)`,
            }
          : undefined
      }
    >
      {colorHex ? (
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: colorHex }}
        />
      ) : (
        <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
      <span className="text-sm font-medium truncate max-w-[120px] sm:max-w-[220px]">
        {activeBranchName}
      </span>
      <Badge
        variant={isMain ? 'secondary' : 'outline'}
        className="hidden sm:inline-flex shrink-0"
      >
        {isMain ? 'Main Branch' : 'Sub-Branch'}
      </Badge>
    </div>
  )
}
