import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  useGetManufacturingSettingsQuery,
  useReportOutputMutation,
  type FinishedGoodsInput,
  type ProductionOrder,
  type ProductionOutput,
} from '@/stores/manufacturing.api'
import { getErrorMessage } from '@/lib/get-error-message'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import type { QualityValue } from '../components/quality-decision'
import { fmtQty } from './constants'
import { announceAutoCompletion } from './order-completion'
import { buildableFrom, cleanFg, consumptionFor } from './output-math'

const EPS = 1e-6

/*
 * Receiving finished goods on a production order — shared by the full receipt page and the
 * quick "Receive finished goods" dialog on the order: the quantity made, what it takes off
 * the floor, where the units go (straight to finished stock, or into the QC hold) and the
 * post itself.
 */

/**
 * The receipt's state and rules. "Receive directly" is the default whenever the user may
 * use it (QC off, or an inspector); otherwise units go to the QC hold.
 */
export function useFinishedGoodsReceipt(order: ProductionOrder | undefined) {
  const { t } = useLanguage()
  const { hasPermission } = usePermissions()
  const canInspect = hasPermission('inspectProduction')
  const { data: settings } = useGetManufacturingSettingsQuery()
  const [reportOutput, { isLoading: posting }] = useReportOutputMutation()

  const qcRequired = settings?.requireQualityCheck ?? true
  const directBlocked = qcRequired && !canInspect
  const [qcMode, setQcMode] = useState<'hold' | 'direct' | null>(null)
  const mode: 'hold' | 'direct' = qcMode ?? (directBlocked ? 'hold' : 'direct')

  const [qty, setQty] = useState<number | null>(null)
  const [quality, setQuality] = useState<QualityValue>({
    good: 0,
    disposition: 'scrap',
    reason: '',
  })
  const [fg, setFg] = useState<FinishedGoodsInput>({})
  const [notes, setNotes] = useState('')

  const remaining = order
    ? Math.max(0, order.plannedQuantity - order.producedQuantity)
    : 0
  const buildable = order ? buildableFrom(order) : 0
  const canMake = Math.min(remaining, buildable)

  // A newly chosen order starts at what the floor can build (capped at what is left).
  useEffect(() => {
    if (!order) return
    const start = canMake > 0 ? canMake : null
    setQty(start)
    setQuality((q) => ({ ...q, good: start || 0 }))
    setFg({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id])

  const quantity = qty || 0
  const lines = useMemo(
    () => (order ? consumptionFor(order, quantity) : []),
    [order, quantity]
  )
  const shortLines = lines.filter((l) => l.short > EPS)
  const materialCost = lines.reduce((s, l) => s + l.cost, 0)
  const overPlan = !!order && quantity > remaining + EPS
  const good = Math.min(quality.good, quantity)
  const rejected = Math.max(0, quantity - good)

  const setQuantity = (n: number | null) => {
    setQty(n)
    // Keep "all passed" in step with the quantity unless rejects were entered.
    setQuality((q) => ({
      ...q,
      good: q.good >= quantity - EPS ? n || 0 : Math.min(q.good, n || 0),
    }))
  }

  const problems = [
    !order && t('Choose the production order'),
    order && !(quantity > 0) && t('Enter how many were made'),
    shortLines.length > 0 &&
      t('Not enough material on the floor for this quantity'),
    overPlan &&
      !settings?.allowOverProduction &&
      t('More than the order still has to make'),
    mode === 'direct' && directBlocked && t('You can’t receive past QC'),
  ].filter(Boolean) as string[]

  /**
   * Posts the receipt; resolves to the output, or null when it could not be posted.
   * `onInspect` adds an "Inspect now" action to the toast when the units went to QC.
   */
  const post = async ({
    onInspect,
  }: {
    onInspect?: (output: ProductionOutput) => void
  } = {}): Promise<ProductionOutput | null> => {
    if (!order || problems.length || posting) return null
    try {
      const out = await reportOutput({
        orderId: order.id,
        producedQuantity: quantity,
        qcMode: mode,
        ...(mode === 'direct'
          ? {
              goodQuantity: good,
              rejectDisposition: quality.disposition,
              rejectReason: rejected > EPS ? quality.reason : undefined,
              finishedGoods: cleanFg(fg),
            }
          : {}),
        notes,
      }).unwrap()
      toast.success(
        mode === 'direct'
          ? `${out.outputNumber} · ${fmtQty(out.goodQuantity)} ${t('to finished stock')}`
          : `${out.outputNumber} · ${fmtQty(out.producedQuantity)} ${t('sent to QC')}`,
        onInspect && canInspect && out.status === 'pending_qc'
          ? {
              action: {
                label: t('Inspect now'),
                onClick: () => onInspect(out),
              },
            }
          : undefined
      )
      announceAutoCompletion(out, order.orderNumber, t)
      return out
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not post the receipt')))
      return null
    }
  }

  /** Ready for another receipt on the same order. */
  const reset = () => {
    setNotes('')
    setQcMode(null)
  }

  return {
    settings,
    canInspect,
    qcRequired,
    directBlocked,
    mode,
    setQcMode,
    qty,
    quantity,
    setQuantity,
    quality,
    setQuality,
    good,
    rejected,
    fg,
    setFg,
    notes,
    setNotes,
    remaining,
    buildable,
    lines,
    materialCost,
    overPlan,
    problems,
    posting,
    post,
    reset,
  }
}
