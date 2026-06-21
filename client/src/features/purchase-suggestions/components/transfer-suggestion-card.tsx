import { ArrowRight, Truck } from 'lucide-react'
import type { TransferSuggestion } from '@/stores/purchaseSuggestions.api'

export function TransferSuggestionCard({ transfer, branchNames }: { transfer: TransferSuggestion; branchNames: Record<string, string> }) {
  const fromName = branchNames[transfer.fromBranchId] || 'Unknown branch'
  const toName = branchNames[transfer.toBranchId] || 'Unknown branch'

  return (
    <div className='flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm'>
      <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-950/40'>
        <Truck className='h-4 w-4 text-cyan-700 dark:text-cyan-400' />
      </span>
      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm font-semibold leading-tight'>{transfer.productName}</p>
        <div className='mt-0.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground'>
          <span className='text-foreground'>{fromName}</span>
          <ArrowRight className='h-3 w-3' />
          <span className='text-foreground'>{toName}</span>
        </div>
        <p className='mt-1 text-xs leading-relaxed text-muted-foreground'>{transfer.reason}</p>
      </div>
      <div className='shrink-0 text-right'>
        <p className='text-xl font-bold tabular-nums leading-none text-cyan-700 dark:text-cyan-400'>{transfer.quantity}</p>
        <p className='text-[10px] text-muted-foreground'>units</p>
      </div>
    </div>
  )
}
