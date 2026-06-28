import { Badge } from '@/components/ui/badge'

const EXPIRY_WARNING_DAYS = 30

/** Color-coded expiry badge shared across reports — same thresholds as
 * VariantBatchPanel's admin-side badge, so a batch reads the same everywhere. */
export function expiryBadge(expiryDate?: string | null) {
  if (!expiryDate) return <span className='text-muted-foreground'>—</span>
  const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (days < 0) return <Badge variant='destructive'>Expired</Badge>
  if (days <= EXPIRY_WARNING_DAYS) {
    return <Badge className='bg-amber-500 text-white hover:bg-amber-500'>Expires in {days}d</Badge>
  }
  return <Badge variant='outline'>{new Date(expiryDate).toLocaleDateString()}</Badge>
}

export function daysUntilExpiry(expiryDate?: string | null) {
  if (!expiryDate) return null
  return Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}
