import { BarChart3, Package, Receipt, AlertTriangle, TrendingUp, Users, ChevronRight } from 'lucide-react'
import { toneIconWrapClass, type StatCardTone } from '@/lib/stat-card-tones'

const QUICK_ACTIONS: { icon: typeof BarChart3; label: string; description: string; prompt: string; tone: StatCardTone }[] = [
  { icon: BarChart3, label: 'Sales Summary', description: 'Today, this week, this month', prompt: "What's my sales summary for this month?", tone: 'sky' },
  { icon: TrendingUp, label: 'Top Products', description: 'Best-selling products', prompt: 'What are my top selling products this month?', tone: 'emerald' },
  { icon: Receipt, label: 'Unpaid Invoices', description: 'See pending payments', prompt: 'Show unpaid customers', tone: 'amber' },
  { icon: AlertTriangle, label: 'Low Stock', description: 'Items that need attention', prompt: 'Which products are low in stock?', tone: 'rose' },
  { icon: Package, label: 'Profit & Loss', description: 'Financial overview', prompt: 'How much profit did I make this month?', tone: 'violet' },
  { icon: Users, label: 'Customer Overview', description: 'New vs returning customers', prompt: 'Show my top customers this month', tone: 'cyan' },
]

export function QuickActions({ onSelect }: { onSelect: (prompt: string) => void }) {
  return (
    <div className='space-y-0.5 px-2 py-2'>
      <p className='px-2.5 pb-1.5 text-xs font-semibold text-muted-foreground'>Quick Actions</p>
      {QUICK_ACTIONS.map(({ icon: Icon, label, description, prompt, tone }) => (
        <button
          key={label}
          type='button'
          onClick={() => onSelect(prompt)}
          className='group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted'
        >
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center ${toneIconWrapClass(tone)}`}>
            <Icon className='h-4 w-4' />
          </span>
          <span className='min-w-0 flex-1'>
            <span className='block truncate text-sm font-medium leading-tight'>{label}</span>
            <span className='block truncate text-xs text-muted-foreground'>{description}</span>
          </span>
          <ChevronRight className='h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary' />
        </button>
      ))}
    </div>
  )
}
