import { useNavigate, useSearch } from '@tanstack/react-router'
import { ClipboardCheck } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLanguage } from '@/context/language-context'
import { CountsTab } from './components/counts-tab'
import { PlanTab } from './components/plan-tab'
import { ReportsTab } from './components/reports-tab'

type Tab = 'counts' | 'plan' | 'reports'

/**
 * Stock Counts: physical counts that keep the system's stock honest.
 *  - Counts: today's cycle count, initial / surprise / custom counts and their history
 *  - Cycle plan: how items are split into A/B/C and how often each class is counted
 *  - Reports: inventory record accuracy, variance value, repeat offenders
 */
export default function StockCounts() {
  const { t } = useLanguage()
  const search = useSearch({ strict: false }) as { tab?: Tab }
  const navigate = useNavigate()
  const tab: Tab = search.tab ?? 'counts'
  const setTab = (next: string) => navigate({ to: '/stock-counts', search: next === 'counts' ? {} : { tab: next as Tab }, replace: true })

  return (
    <div className='space-y-6 p-4 md:p-6 max-sm:space-y-4 max-sm:p-0'>
      <div className='flex items-center gap-2 max-sm:items-start'>
        <ClipboardCheck className='h-6 w-6 text-primary max-sm:mt-1' />
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>{t('Stock Counts')}</h1>
          <p className='text-sm text-muted-foreground'>
            {t('Initial counts, daily A/B/C cycle counts and surprise audits — differences are posted as stock adjustments')}
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className='max-sm:grid max-sm:w-full max-sm:grid-cols-3'>
          <TabsTrigger value='counts'>{t('Counts')}</TabsTrigger>
          <TabsTrigger value='plan'>{t('Cycle plan')}</TabsTrigger>
          <TabsTrigger value='reports'>{t('Accuracy')}</TabsTrigger>
        </TabsList>
        <TabsContent value='counts' className='mt-4'>
          <CountsTab />
        </TabsContent>
        <TabsContent value='plan' className='mt-4'>
          <PlanTab />
        </TabsContent>
        <TabsContent value='reports' className='mt-4'>
          <ReportsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
