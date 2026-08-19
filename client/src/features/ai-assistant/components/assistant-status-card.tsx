import { Bot } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export function AssistantStatusCard() {
  return (
    <Card className='py-4'>
      <CardContent className='flex items-center gap-3 px-4'>
        <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary'>
          <Bot className='h-4 w-4' />
        </span>
        <div className='min-w-0'>
          <p className='flex items-center gap-1.5 text-sm font-semibold'>
            AI Assistant
            <span className='flex items-center gap-1 text-xs font-normal text-emerald-600 dark:text-emerald-400'>
              <span className='relative flex h-1.5 w-1.5'>
                <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75' />
                <span className='relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500' />
              </span>
              Online
            </span>
          </p>
          <p className='text-xs text-muted-foreground'>Ready to help with your business data.</p>
        </div>
      </CardContent>
    </Card>
  )
}
