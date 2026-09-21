import { Undo2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import type { BatchStatus } from '@/stores/priceUpdate.api'

const STATUS: Record<BatchStatus, { label: string; className: string }> = {
  applying: { label: 'Interrupted', className: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-400' },
  applied: { label: 'Applied', className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  failed: { label: 'Nothing changed', className: 'border-muted-foreground/30 bg-muted text-muted-foreground' },
  rolled_back: { label: 'Undone', className: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400' },
  partially_rolled_back: { label: 'Partly undone', className: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-400' },
}

export function StatusBadge({ status }: { status: BatchStatus }) {
  const { t } = useLanguage()
  const s = STATUS[status] || STATUS.applied
  return (
    <Badge variant='outline' className={cn('gap-1', s.className)}>
      {(status === 'rolled_back' || status === 'partially_rolled_back') && <Undo2 className='h-3 w-3' />}
      {t(s.label)}
    </Badge>
  )
}
