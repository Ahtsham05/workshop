import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// Icon-tinted color per tile — decorative wayfinding on self-labeled cards (not a
// categorical series needing CVD validation), reserving destructive red for the one
// genuinely critical metric (Failed) and keeping every other tile visually distinct.
export const TILE_COLORS = {
  slate: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  green: 'bg-wa-accent/10 text-wa-accent',
  blue: 'bg-[#53BDEB]/10 text-[#53BDEB]',
  violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  red: 'bg-destructive/10 text-destructive',
} as const

export function StatTile({
  icon,
  label,
  value,
  color,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  color: keyof typeof TILE_COLORS
}) {
  return (
    <Card className='overflow-hidden'>
      <CardContent className='flex items-center gap-3 p-4'>
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', TILE_COLORS[color])}>
          {icon}
        </div>
        <div className='min-w-0'>
          <p className='truncate text-xs font-medium text-muted-foreground'>{label}</p>
          <p className='text-2xl font-bold leading-tight'>{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}
