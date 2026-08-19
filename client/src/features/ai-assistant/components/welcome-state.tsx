import { Sparkles, DollarSign, ShoppingCart, Package, Users, Boxes, Wallet } from 'lucide-react'
import { toneIconWrapClass, type StatCardTone } from '@/lib/stat-card-tones'

const SUGGESTIONS: { icon: typeof DollarSign; category: string; text: string; tone: StatCardTone }[] = [
  { icon: DollarSign, category: 'Financial', text: 'How much profit did I make this month?', tone: 'violet' },
  { icon: ShoppingCart, category: 'Sales', text: "Show today's sales", tone: 'sky' },
  { icon: Boxes, category: 'Inventory', text: 'Which products are low in stock?', tone: 'rose' },
  { icon: Users, category: 'Customers', text: 'Show unpaid customers', tone: 'cyan' },
  { icon: Package, category: 'Products', text: "Which products haven't sold in 30 days?", tone: 'emerald' },
  { icon: Wallet, category: 'Banking', text: "What's my cash and bank balance?", tone: 'amber' },
]

export function WelcomeState({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    <div className='flex h-full flex-col items-center justify-center gap-6 px-4 py-10 text-center'>
      <div className='relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-violet-500/20'>
        <span className='absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/10 to-violet-500/10 motion-safe:animate-pulse' />
        <Sparkles className='relative h-7 w-7 text-primary' />
      </div>

      <div className='space-y-1.5'>
        <h1 className='text-xl font-semibold tracking-tight sm:text-2xl'>How can I help you today?</h1>
        <p className='mx-auto max-w-md text-sm text-muted-foreground'>
          Ask me anything about your business — sales, inventory, customers, invoices, or finances. Type, or use
          voice, in any language.
        </p>
      </div>

      <div className='grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2'>
        {SUGGESTIONS.map(({ icon: Icon, category, text, tone }) => (
          <button
            key={text}
            type='button'
            onClick={() => onSelect(text)}
            className='group flex items-start gap-2.5 rounded-xl border bg-background px-3.5 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md'
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center ${toneIconWrapClass(tone)}`}>
              <Icon className='h-4 w-4' />
            </span>
            <span className='min-w-0'>
              <span className='block text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70'>
                {category}
              </span>
              <span className='block text-sm text-foreground'>{text}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
