import { usePermissions } from '@/context/permission-context'

export type CreatedByRef = string | { name?: string; email?: string } | null | undefined

function resolveCreatedByName(ref: CreatedByRef): string {
  if (!ref) return '—'
  if (typeof ref === 'string') return ref
  return ref.name || ref.email || '—'
}

/** Gate for admin-only "who created this" visibility — mirrors the <Can> permission pattern. */
export function useCanViewCreatedBy(): boolean {
  const { hasPermission } = usePermissions()
  return hasPermission('viewCreatedBy')
}

/**
 * Renders the creator's name, but only for viewers with the `viewCreatedBy` permission.
 * Renders nothing (not blurred/masked) for everyone else, so pair the header cell with
 * useCanViewCreatedBy() to keep the column itself out of the table for those viewers too.
 */
export function CreatedByCell({ createdBy }: { createdBy: CreatedByRef }) {
  const canView = useCanViewCreatedBy()
  if (!canView) return null
  return <span className="text-sm text-muted-foreground">{resolveCreatedByName(createdBy)}</span>
}
