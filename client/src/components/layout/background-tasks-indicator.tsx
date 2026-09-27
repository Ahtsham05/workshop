import { CheckCircle2, CircleAlert, Loader2, TriangleAlert, X } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { dismissBackgroundTask, useBackgroundTasks, type BackgroundTask } from '@/lib/background-tasks'

const STATUS_ICON = {
  running: <Loader2 className='size-4 shrink-0 animate-spin text-primary' />,
  success: <CheckCircle2 className='size-4 shrink-0 text-emerald-600' />,
  warning: <TriangleAlert className='size-4 shrink-0 text-amber-600' />,
  error: <CircleAlert className='size-4 shrink-0 text-destructive' />,
} satisfies Record<BackgroundTask['status'], React.ReactNode>

function TaskRow({ task }: { task: BackgroundTask }) {
  const { t } = useLanguage()
  const percent = task.progress && task.progress.total > 0 ? Math.round((task.progress.done / task.progress.total) * 100) : null
  return (
    <li className='flex gap-2.5 py-2.5'>
      <span className='mt-0.5'>{STATUS_ICON[task.status]}</span>
      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm font-medium'>{task.title}</p>
        {task.status === 'running' ? (
          <>
            {task.detail && <p className='text-muted-foreground truncate text-xs'>{task.detail}</p>}
            {percent !== null && (
              <div className='mt-1.5 flex items-center gap-2'>
                <Progress value={percent} className='h-1.5' aria-label={t('Progress')} />
                <span className='text-muted-foreground w-9 shrink-0 text-right text-xs tabular-nums'>{percent}%</span>
              </div>
            )}
          </>
        ) : (
          task.message && <p className='text-muted-foreground text-xs break-words'>{task.message}</p>
        )}
      </div>
      {task.status !== 'running' && (
        <Button
          variant='ghost'
          size='icon'
          className='size-6 shrink-0'
          onClick={() => dismissBackgroundTask(task.id)}
          aria-label={t('Dismiss')}
        >
          <X className='size-3.5' />
        </Button>
      )}
    </li>
  )
}

/**
 * Header indicator for work still finishing in the background (see lib/background-tasks.ts).
 * Shows nothing when there is none, a spinner with a count while something runs, and the
 * last result for a minute after it finishes.
 */
export function BackgroundTasksIndicator({ className }: { className?: string }) {
  const { t } = useLanguage()
  const tasks = useBackgroundTasks()
  if (tasks.length === 0) return null

  const running = tasks.filter((task) => task.status === 'running').length
  const worst = tasks.find((task) => task.status === 'error') ?? tasks.find((task) => task.status === 'warning')

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant='ghost'
          size='sm'
          className={cn('h-8 gap-1.5 rounded-full px-2.5', className)}
          aria-label={running ? t('{{count}} task(s) running in the background', { count: running }) : t('Background tasks')}
        >
          {running ? STATUS_ICON.running : worst ? STATUS_ICON[worst.status] : STATUS_ICON.success}
          {running > 0 && <span className='text-xs font-medium tabular-nums'>{running}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-80 p-0'>
        <div className='border-b px-3 py-2'>
          <p className='text-sm font-semibold'>{t('Background tasks')}</p>
          <p className='text-muted-foreground text-xs'>
            {running ? t('Keep working — these finish on their own.') : t('Everything has finished.')}
          </p>
        </div>
        <ul className='max-h-80 divide-y overflow-y-auto px-3'>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
