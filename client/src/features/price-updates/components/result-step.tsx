import { useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Download, History, Loader2, PlusCircle, TriangleAlert, Undo2 } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useLanguage } from '@/context/language-context'
import { getErrorMessage } from '@/lib/get-error-message'
import { cn } from '@/lib/utils'
import { useRollbackPriceUpdateMutation } from '@/stores/priceUpdate.api'

import { exportPriceChanges, type ExportLine } from '../lib/export'
import type { AppliedResult } from './review-step'

interface ResultStepProps {
  result: AppliedResult
  onNew: () => void
  onViewHistory: (batchId: string) => void
}

export function ResultStep({ result, onNew, onViewHistory }: ResultStepProps) {
  const { t } = useLanguage()
  const { response, sent } = result
  const { stats, batch } = response
  const [undoOpen, setUndoOpen] = useState(false)
  const [undone, setUndone] = useState<{ reverted: number; conflicts: number } | null>(null)
  const [rollback, { isLoading: undoing }] = useRollbackPriceUpdateMutation()

  const problems = response.results.filter((r) => r.status !== 'applied' && r.status !== 'unchanged')
  const nameOf = (index: number) => {
    const d = sent[index]
    return d && d.entry ? d.entry.name : `#${index + 1}`
  }

  const doUndo = async () => {
    setUndoOpen(false)
    try {
      const out = await rollback({ batchId: batch.id }).unwrap()
      setUndone({ reverted: out.reverted, conflicts: out.conflicts })
      toast.success(`${t('Restored')} ${out.reverted} ${t(out.reverted === 1 ? 'product' : 'products')}`)
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not undo this update')))
    }
  }

  const doExport = () => {
    const lines: ExportLine[] = sent.map((d, i) => {
      const r = response.results.find((x) => x.index === i)
      return {
        product: d.entry ? d.entry.name : d.row.name,
        code: d.entry ? d.entry.sku || d.entry.barcode : '',
        oldCost: d.entry ? d.entry.cost : null,
        newCost: d.calc && d.calc.costChanged && d.calc.newCost !== undefined ? d.calc.newCost : null,
        oldPrice: d.entry ? d.entry.price : null,
        newPrice: d.calc && d.calc.priceChanged && d.calc.newPrice !== undefined ? d.calc.newPrice : null,
        status: r ? r.status : '',
        fromList: d.row.raw,
        note: r && r.message ? r.message : '',
      }
    })
    exportPriceChanges(lines, `price-update-${batch.batchNumber}`)
  }

  const tiles = [
    { label: t('Updated'), value: stats.applied, tone: 'text-emerald-600' },
    { label: t('Already correct'), value: stats.unchanged, tone: 'text-muted-foreground' },
    { label: t('Skipped'), value: stats.stale, tone: stats.stale ? 'text-amber-600' : 'text-muted-foreground' },
    { label: t('Failed'), value: stats.failed, tone: stats.failed ? 'text-red-600' : 'text-muted-foreground' },
  ]

  return (
    <div className='mx-auto max-w-3xl space-y-4'>
      <Card className={cn(undone ? 'border-amber-500/40' : 'border-emerald-500/40')}>
        <CardContent className='flex flex-col items-center gap-3 p-5 text-center sm:p-8'>
          {undone ? <Undo2 className='h-12 w-12 text-amber-600' /> : <CheckCircle2 className='h-12 w-12 text-emerald-600' />}
          <div>
            <h2 className='text-xl font-bold'>
              {undone
                ? `${t('Update undone')} — ${undone.reverted} ${t(undone.reverted === 1 ? 'product restored' : 'products restored')}`
                : `${stats.applied} ${t(stats.applied === 1 ? 'price updated' : 'prices updated')}`}
            </h2>
            <p className='mt-1 text-sm text-muted-foreground'>
              {t('Price update')} #{batch.batchNumber}
              {batch.source.supplierName ? ` · ${batch.source.supplierName}` : ''}
              {!undone && stats.applied > 0 && ` · ${t('average cost')} ${stats.avgCostChangePercent > 0 ? '+' : ''}${stats.avgCostChangePercent}%`}
            </p>
            {undone && undone.conflicts > 0 && (
              <p className='mt-2 text-sm text-amber-700 dark:text-amber-400'>
                {undone.conflicts} {t('products were changed again after this update, so they were left as they are.')}
              </p>
            )}
          </div>
          <div className='mt-2 grid w-full max-w-md grid-cols-2 gap-2 sm:grid-cols-4'>
            {tiles.map((tile) => (
              <div key={tile.label} className='rounded-lg border p-2'>
                <p className={cn('text-xl font-bold tabular-nums', tile.tone)}>{tile.value}</p>
                <p className='text-[11px] text-muted-foreground'>{tile.label}</p>
              </div>
            ))}
          </div>
          <div className='mt-3 flex flex-wrap justify-center gap-2'>
            <Button onClick={onNew}>
              <PlusCircle className='mr-1.5 h-4 w-4' /> {t('Update more prices')}
            </Button>
            <Button variant='outline' onClick={doExport}>
              <Download className='mr-1.5 h-4 w-4' /> {t('Export changes')}
            </Button>
            <Button variant='outline' onClick={() => onViewHistory(batch.id)}>
              <History className='mr-1.5 h-4 w-4' /> {t('View in history')}
            </Button>
            {!undone && stats.applied > 0 && (
              <Button variant='outline' className='text-amber-700 hover:text-amber-700' onClick={() => setUndoOpen(true)} disabled={undoing}>
                {undoing ? <Loader2 className='mr-1.5 h-4 w-4 animate-spin' /> : <Undo2 className='mr-1.5 h-4 w-4' />}
                {t('Undo this update')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {problems.length > 0 && (
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='flex items-center gap-2 text-sm'>
              <TriangleAlert className='h-4 w-4 text-amber-600' /> {problems.length} {t(problems.length === 1 ? 'line was not applied' : 'lines were not applied')}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-2'>
            <Alert>
              <AlertDescription className='text-xs'>
                {t('These products were left exactly as they were. Skipped means someone changed the product while you were reviewing — run the update again to include it.')}
              </AlertDescription>
            </Alert>
            <ul className='divide-y text-sm'>
              {problems.map((p) => (
                <li key={`${p.index}-${p.productId}`} className='flex flex-wrap items-baseline justify-between gap-x-4 py-1.5'>
                  <span className='font-medium'>{nameOf(p.index)}</span>
                  <span className='text-xs text-muted-foreground'>{p.message || p.status}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={undoOpen} onOpenChange={setUndoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Undo this whole update?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('Every product goes back to the cost and price it had before. Anything that was changed again since (a new purchase, another edit) is left alone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Keep the update')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doUndo()}>{t('Undo update')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
