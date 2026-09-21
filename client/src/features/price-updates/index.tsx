import { useEffect, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { History as HistoryIcon, TrendingUp, Wand2 } from 'lucide-react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'

import { BatchSheet } from './components/batch-sheet'
import { HistoryTab } from './components/history-tab'
import { SavedMatchesDialog } from './components/saved-matches-dialog'
import { UpdateWizard } from './components/update-wizard'

export default function PriceUpdates() {
  const { t } = useLanguage()
  const { hasPermission } = usePermissions()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { tab?: 'update' | 'history'; batch?: string }

  const canManage = hasPermission('managePriceUpdates')
  // Someone who can only VIEW price updates sees the history, not an update screen they couldn't use.
  const tab = canManage ? search.tab || 'update' : 'history'
  const [savedOpen, setSavedOpen] = useState(false)
  const [openBatch, setOpenBatch] = useState<string | null>(search.batch || null)

  useEffect(() => {
    setOpenBatch(search.batch || null)
  }, [search.batch])

  const go = (next: { tab?: 'update' | 'history'; batch?: string }) =>
    navigate({ to: '/price-updates', search: next, replace: true })

  return (
    <div className='space-y-6 p-4 md:p-6'>
      <div className='relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 sm:p-6'>
        <TrendingUp className='pointer-events-none absolute -right-4 -top-4 h-32 w-32 rotate-6 text-primary/[0.06]' />
        <div className='relative flex flex-wrap items-center gap-4'>
          <span className='inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm'>
            <TrendingUp className='h-6 w-6' />
          </span>
          <div className='min-w-0'>
            <h1 className='text-2xl font-bold tracking-tight'>{t('Price Updates')}</h1>
            <p className='mt-0.5 max-w-2xl text-sm text-muted-foreground'>
              {t('Turn a supplier’s WhatsApp message, PDF or Excel price list into updated costs and selling prices — you review every change first, and can undo the whole update.')}
            </p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => go({ tab: v as 'update' | 'history' })}>
        <TabsList>
          {canManage && (
            <TabsTrigger value='update' className='gap-2'>
              <Wand2 className='h-4 w-4' /> {t('Update prices')}
            </TabsTrigger>
          )}
          <TabsTrigger value='history' className='gap-2'>
            <HistoryIcon className='h-4 w-4' /> {t('History')}
          </TabsTrigger>
        </TabsList>

        {canManage && (
          <TabsContent value='update' className='mt-4'>
            <UpdateWizard onOpenSavedMatches={() => setSavedOpen(true)} onViewHistory={(batch) => go({ tab: 'history', batch })} />
          </TabsContent>
        )}
        <TabsContent value='history' className='mt-4'>
          <HistoryTab onOpen={(batch) => go({ tab: 'history', batch })} />
        </TabsContent>
      </Tabs>

      <BatchSheet batchId={openBatch} onClose={() => go({ tab: 'history' })} />
      <SavedMatchesDialog open={savedOpen} onOpenChange={setSavedOpen} />
    </div>
  )
}
