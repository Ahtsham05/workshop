import { useEffect, useMemo, useState } from 'react'
import { skipToken } from '@reduxjs/toolkit/query'
import { toast } from 'sonner'
import {
  useGetManufacturingSettingsQuery,
  useGetPackingSetupQuery,
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
import { packingSummary, type PackCounts } from './packing-math'

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
/** Starting values — "Reverse & receive again" brings the reversed receipt's packs back. */
export interface ReceiptPrefill {
  quantity?: number
  packCounts?: PackCounts
}

export function useFinishedGoodsReceipt(
  order: ProductionOrder | undefined,
  prefill?: ReceiptPrefill
) {
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

  // An order on a product with several variants that never named one: the receipt asks
  // which variant was made (stored on the order when posted).
  const [chosenVariant, setChosenVariant] = useState<string | null>(null)
  const variantId = order?.variantId || chosenVariant || null

  // Packing straight off the receipt: a bulk product (kg) with pack sizes is packed into
  // cartons / bags in the same post. On by default when the product has pack sizes.
  const {
    data: packSetup,
    isLoading: packSetupLoading,
    error: packSetupError,
  } = useGetPackingSetupQuery(
    order
      ? { productId: order.productId, variantId }
      : skipToken
  )
  const packSizes = useMemo(
    () => (packSetup?.sizes || []).filter((s) => s.isActive),
    [packSetup]
  )
  const [packOn, setPackOn] = useState<boolean | null>(null)
  const [packCounts, setPackCounts] = useState<PackCounts>({})
  const packEnabled =
    (packOn ?? true) && packSizes.length > 0 && !!packSetup?.product.packable
  // Packing drives the quantity: packs × content + extra (loose) = good received. Typing
  // the quantity by hand switches this off; "Use packed total" switches it back on.
  const [loose, setLoose] = useState<number | null>(null)
  const [autoQty, setAutoQty] = useState(true)
  const packedKg = useMemo(
    () =>
      Math.round(
        packSizes.reduce(
          (sum, s) => sum + (Number(packCounts[s.id]) || 0) * s.contentQuantity,
          0
        ) * 1e6
      ) / 1e6,
    [packSizes, packCounts]
  )
  // Several variants and none named yet → the receipt must say which one.
  const variantChoices =
    order && !order.variantId && (packSetup?.product.variants.length || 0) > 1
      ? packSetup!.product.variants
      : []
  const needsVariant = variantChoices.length > 0 && !chosenVariant

  const remaining = order
    ? Math.max(0, order.plannedQuantity - order.producedQuantity)
    : 0
  const buildable = order ? buildableFrom(order) : 0
  const canMake = Math.min(remaining, buildable)

  // A newly chosen order starts at what the floor can build (capped at what is left).
  useEffect(() => {
    if (!order) return
    const fromPrefill =
      prefill?.quantity && prefill.quantity > 0 ? prefill.quantity : null
    const start = fromPrefill ?? (canMake > 0 ? canMake : null)
    setQty(start)
    setQuality((q) => ({ ...q, good: start || 0 }))
    setFg({})
    setPackCounts(prefill?.packCounts || {})
    setLoose(null)
    setAutoQty(true)
    setPackOn(null)
    setChosenVariant(null)
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
  const packing = packingSummary(packSizes, packCounts, good)
  const packingNow =
    packEnabled && mode === 'direct' && packing.lines.length > 0
  const autoActive =
    autoQty && packEnabled && mode === 'direct' && (packedKg > 0 || (loose || 0) > 0)

  // Auto total: whenever the packs or the loose kg change, good = packed + loose and the
  // quantity made = good + whatever was rejected.
  useEffect(() => {
    if (!autoActive) return
    const goodNow = Math.round((packedKg + (loose || 0)) * 1e6) / 1e6
    setQty(Math.round((goodNow + rejected) * 1e6) / 1e6)
    setQuality((q) => ({ ...q, good: goodNow }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoActive, packedKg, loose])

  /** The quantity typed by hand — packing no longer sets it. */
  const setQuantity = (n: number | null) => {
    setAutoQty(false)
    setQty(n)
    // Keep "all passed" in step with the quantity unless rejects were entered.
    setQuality((q) => ({
      ...q,
      good: q.good >= quantity - EPS ? n || 0 : Math.min(q.good, n || 0),
    }))
  }

  const problems = [
    !order && t('Choose the production order'),
    needsVariant && t('Choose which variant was made'),
    order && !(quantity > 0) && t('Enter how many were made'),
    shortLines.length > 0 &&
      t('Not enough material on the floor for this quantity'),
    overPlan &&
      !settings?.allowOverProduction &&
      t('More than the order still has to make'),
    mode === 'direct' && directBlocked && t('You can’t receive past QC'),
    packingNow &&
      packing.over &&
      t('The packs hold more than the good quantity received'),
    packingNow &&
      packing.shortMaterials.length > 0 &&
      `${t('Not enough packing material')}: ${packing.shortMaterials.join(', ')}`,
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
        ...(chosenVariant && !order.variantId ? { variantId: chosenVariant } : {}),
        qcMode: mode,
        ...(mode === 'direct'
          ? {
              goodQuantity: good,
              rejectDisposition: quality.disposition,
              rejectReason: rejected > EPS ? quality.reason : undefined,
              finishedGoods: cleanFg(fg),
              ...(packingNow ? { packing: { lines: packing.lines } } : {}),
            }
          : {}),
        notes,
      }).unwrap()
      if (out.packing) {
        toast.success(
          `${out.packing.voucherNumber} · ${fmtQty(packing.packs)} ${t('packs')} (${fmtQty(packing.packed)} ${order.unit})${
            packing.loose > EPS
              ? ` · ${fmtQty(packing.loose)} ${order.unit} ${t('loose')}`
              : ''
          }`
        )
      }
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
    setPackCounts({})
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
    variantChoices,
    chosenVariant,
    setChosenVariant,
    loose,
    setLoose,
    packedKg,
    autoActive,
    autoQty,
    setAutoQty,
    packSetup,
    packSetupLoading,
    packSetupError,
    packSizes,
    packEnabled,
    setPackOn,
    packCounts,
    setPackCounts,
    packing,
  }
}
