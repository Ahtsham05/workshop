import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useGetFunnelStatsQuery, type FunnelRange } from '@/stores/whatsappCloud.api'

const RANGE_OPTIONS: { value: FunnelRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
]

// One hue (WhatsApp teal), monotone lightness Sent (darkest/most prominent) ->
// Replied (lightest) — validated sequential ramp, not an arbitrary pick. See
// dataviz skill: ordinal check passes lightness-monotone + adjacent-ΔL +
// light-end-contrast for both modes. Tailwind classes (not inline style) so
// dark: actually switches the shade instead of being stuck on one value.
const STAGE_BAR_CLASS = [
  'bg-[#0A5445] dark:bg-[#0A5F52]', // sent
  'bg-[#0F8570] dark:bg-[#17A889]', // delivered
  'bg-[#17B392] dark:bg-[#3FC7A5]', // read
  'bg-[#4FC4A9] dark:bg-[#6FE0C2]', // replied
]

export function ConversationFunnelWidget() {
  const [range, setRange] = useState<FunnelRange>('7d')
  const { data, isLoading } = useGetFunnelStatsQuery({ range })

  const stages = data?.stages ?? []
  const hasData = stages.some((s) => s.count > 0)

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between gap-2 pb-2'>
        <CardTitle className='text-sm font-medium text-muted-foreground'>Conversation Funnel</CardTitle>
        <div className='flex gap-1'>
          {RANGE_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              size='sm'
              variant={range === opt.value ? 'default' : 'outline'}
              className={cn('h-7 px-2 text-xs', range === opt.value && 'bg-[#00A884] hover:bg-[#00A884]/90')}
              onClick={() => setRange(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className='space-y-3'>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className='h-8 w-full' />
            ))}
          </div>
        ) : !hasData ? (
          <p className='py-6 text-center text-sm text-muted-foreground'>
            No messages sent in this period yet.
          </p>
        ) : (
          <div className='space-y-3'>
            {stages.map((stage, i) => {
              const prev = stages[i - 1]
              const dropOff = prev && prev.count > 0 ? Math.round(((prev.count - stage.count) / prev.count) * 100) : null
              return (
                <div key={stage.key}>
                  {dropOff !== null && dropOff > 0 && (
                    <p className='mb-1 text-[11px] text-muted-foreground'>↓ {dropOff}% drop-off</p>
                  )}
                  <div className='flex items-center gap-3'>
                    <span className='w-16 shrink-0 text-xs text-muted-foreground'>{stage.label}</span>
                    <div className='h-6 flex-1 rounded-full bg-muted overflow-hidden'>
                      <div
                        className={cn('h-full rounded-full transition-all', STAGE_BAR_CLASS[i])}
                        style={{ width: `${Math.max(stage.percentOfSent, stage.count > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                    <span className='w-20 shrink-0 text-right text-sm font-semibold tabular-nums'>
                      {stage.count}
                      <span className='ml-1 text-xs font-normal text-muted-foreground'>({stage.percentOfSent}%)</span>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
