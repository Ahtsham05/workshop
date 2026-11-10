import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch } from 'react-redux'
import { toast } from 'sonner'
import {
  useSaveRepairBillMutation,
  type RepairBillLineInput,
  type RepairBillSave,
  type RepairJobRecord,
  type RepairPaymentMethod,
} from '@/stores/mobile-shop.api'
import { purchaseCatalogApi } from '@/stores/purchaseCatalog.api'

/** A bill line on screen — a saved item (has `id`) or one added since the last save. */
export interface DraftLine {
  key: string
  id?: string
  kind: 'part' | 'service'
  productId?: string | null
  variantId?: string | null
  batchId?: string | null
  /** Multi-warehouse: which warehouse the part comes out of (unset = default). */
  warehouseId?: string | null
  name: string
  quantity: number
  unitPrice: number
  unitCost: number
  paidOutMethod?: RepairPaymentMethod | string | null
  paidOutWallet?: string
  isNew: boolean
  changed: boolean
}

export type NewLine = Omit<DraftLine, 'key' | 'id' | 'isNew' | 'changed'>

const round2 = (n: number) => Math.round(n * 100) / 100
let seq = 0
const tempKey = () => `new-${Date.now()}-${++seq}`

const fromJob = (job: RepairJobRecord): DraftLine[] =>
  (job.items ?? []).map((i) => ({
    key: i.id,
    id: i.id,
    kind: i.kind,
    productId: i.productId ?? null,
    variantId: i.variantId ?? null,
    name: i.name,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    unitCost: i.unitCost,
    paidOutMethod: i.paidOutMethod ?? null,
    paidOutWallet: i.paidOutWallet,
    isNew: false,
    changed: false,
  }))

/**
 * The job's bill as an editable draft, saved in one request (like an invoice): adding,
 * editing and removing lines never touches the server — stock moves when `save()` runs.
 */
export function useBillDraft(job: RepairJobRecord | undefined) {
  const dispatch = useDispatch()
  const [lines, setLines] = useState<DraftLine[]>([])
  const [removed, setRemoved] = useState<DraftLine[]>([])
  const [discount, setDiscount] = useState(0)
  const [directCost, setDirectCost] = useState(0)
  const [saveBill, { isLoading: saving }] = useSaveRepairBillMutation()
  const loadedFor = useRef<string | null>(null)

  const dirty =
    !!job &&
    (removed.length > 0 ||
      lines.some((l) => l.isNew || l.changed) ||
      round2(discount) !== round2(job.discount ?? 0) ||
      round2(directCost) !== round2(job.directCost ?? 0))

  const reset = useCallback((j: RepairJobRecord) => {
    setLines(fromJob(j))
    setRemoved([])
    setDiscount(j.discount ?? 0)
    setDirectCost(j.directCost ?? 0)
    loadedFor.current = j.id
  }, [])

  // Follow the server copy while nothing is pending; a pending draft is never overwritten.
  useEffect(() => {
    if (!job) return
    if (loadedFor.current !== job.id || !dirty) reset(job)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job])

  const add = useCallback((line: NewLine) => {
    setLines((prev) => [
      ...prev,
      { ...line, key: tempKey(), isNew: true, changed: false },
    ])
  }, [])

  const update = useCallback(
    (
      key: string,
      patch: Partial<
        Pick<DraftLine, 'quantity' | 'unitPrice' | 'unitCost' | 'name'>
      >
    ) => {
      setLines((prev) =>
        prev.map((l) =>
          l.key === key ? { ...l, ...patch, changed: !l.isNew } : l
        )
      )
    },
    []
  )

  const remove = useCallback(
    (key: string) => {
      const line = lines.find((l) => l.key === key)
      if (line && !line.isNew)
        setRemoved((r) => (r.some((x) => x.key === key) ? r : [...r, line]))
      setLines((prev) => prev.filter((l) => l.key !== key))
    },
    [lines]
  )

  /** Quantity of a product already on unsaved lines — so the picker doesn't oversell stock. */
  const pendingQty = useCallback(
    (productId: string) =>
      lines
        .filter((l) => l.isNew && l.productId === productId)
        .reduce((s, l) => s + l.quantity, 0),
    [lines]
  )

  const totals = useMemo(() => {
    const subtotal = round2(
      lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
    )
    const partsCost = round2(
      lines.reduce((s, l) => s + l.quantity * l.unitCost, 0)
    )
    const charges = lines.length
      ? round2(Math.max(0, subtotal - discount))
      : round2(Math.max(0, (job?.estimatedCharges ?? 0) - discount))
    const cost = round2(partsCost + directCost)
    return {
      subtotal,
      partsCost,
      charges,
      cost,
      profit: round2(charges - cost),
      balance: round2(charges - (job?.advanceAmount ?? 0)),
    }
  }, [lines, discount, directCost, job?.estimatedCharges, job?.advanceAmount])

  const payload = (): RepairBillSave => {
    const body: RepairBillSave = {}
    const add: RepairBillLineInput[] = lines
      .filter((l) => l.isNew)
      .map((l) => ({
        kind: l.kind,
        productId: l.productId || undefined,
        variantId: l.variantId || undefined,
        batchId: l.batchId || undefined,
        warehouseId: l.warehouseId || undefined,
        name: l.name,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        unitCost: l.productId ? undefined : l.unitCost,
        paidOutMethod: l.paidOutMethod || undefined,
        paidOutWallet: l.paidOutWallet || undefined,
      }))
    const update = lines
      .filter((l) => !l.isNew && l.changed && l.id)
      .map((l) => ({
        itemId: l.id!,
        unitPrice: l.unitPrice,
        ...(l.productId ? {} : { quantity: l.quantity, unitCost: l.unitCost }),
      }))
    if (add.length) body.add = add
    if (update.length) body.update = update
    if (removed.length) body.remove = removed.map((l) => l.id!).filter(Boolean)
    if (job && round2(discount) !== round2(job.discount ?? 0))
      body.discount = round2(discount)
    if (job && round2(directCost) !== round2(job.directCost ?? 0))
      body.directCost = round2(directCost)
    return body
  }

  /** Saves pending changes (no-op when clean). Resolves to the saved job, or null on failure. */
  const save = useCallback(
    async (
      extra?: Partial<RepairBillSave>
    ): Promise<RepairJobRecord | null> => {
      if (!job) return null
      const body = { ...payload(), ...extra }
      if (!Object.keys(body).length) return job
      const movesStock = !!(
        body.add?.some((a) => a.productId) || removed.some((l) => l.productId)
      )
      try {
        const saved = await saveBill({ id: job.id, ...body }).unwrap()
        reset(saved)
        // One catalog refresh per save, not per line.
        if (movesStock)
          dispatch(purchaseCatalogApi.util.invalidateTags(['PurchaseCatalog']))
        return saved
      } catch (e) {
        toast.error(
          (e as { data?: { message?: string } })?.data?.message ||
            'Could not save the bill'
        )
        return null
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [job, lines, removed, discount, directCost, saveBill, reset, dispatch]
  )

  const discard = useCallback(() => job && reset(job), [job, reset])

  return {
    lines,
    removed,
    discount,
    setDiscount,
    directCost,
    setDirectCost,
    add,
    update,
    remove,
    pendingQty,
    totals,
    dirty,
    saving,
    save,
    discard,
    pendingCount:
      lines.filter((l) => l.isNew || l.changed).length +
      removed.length +
      (job && round2(discount) !== round2(job.discount ?? 0) ? 1 : 0) +
      (job && round2(directCost) !== round2(job.directCost ?? 0) ? 1 : 0),
  }
}

export type BillDraft = ReturnType<typeof useBillDraft>
