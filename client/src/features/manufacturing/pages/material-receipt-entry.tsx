import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ListPlus, Printer, Trash2 } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { toast } from 'sonner'
import {
  useDeleteMaterialReceiptMutation,
  useGetManufacturingSettingsQuery,
  useGetMaterialReceiptQuery,
  useGetOrderFilterOptionsQuery,
  useSaveMaterialReceiptMutation,
  type MaterialReceipt,
} from '@/stores/manufacturing.api'
import {
  purchaseOrderApi,
  useGetPurchaseOrdersQuery,
  type PurchaseOrder,
} from '@/stores/purchaseOrder.api'
import type { AppDispatch, RootState } from '@/stores/store'
import { fetchSuppliers } from '@/stores/supplier.slice'
import { useFormatMoney } from '@/lib/format-money'
import { getErrorMessage } from '@/lib/get-error-message'
import { useLanguage } from '@/context/language-context'
import { useBranchName } from '@/hooks/use-branch-name'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  TransactionEntry,
  rowErrorsFromApi,
  useCatalogProductSource,
  useCatalogStockSource,
  type EntryStore,
  type HeaderField,
  type SaveMode,
} from '@/components/transaction-engine'
import { PageHeader } from '../components/page'
import { useConfirm } from '../lib/confirm'
import { fmtDate } from '../lib/constants'
import {
  blankReceiptRow,
  computeReceiptLine,
  createReceiptConfig,
  receiptToRows,
  receivableSource,
  rowToLine,
  type ReceiptHeader,
  type ReceiptRow,
} from '../lib/material-receipt'
import { printMaterialReceipt } from '../lib/material-receipt-print'

const OPEN_PO = ['draft', 'sent', 'partial']
const LIST = '/manufacturing/material-receipts'

/**
 * RMV entry (new, draft) and view (posted). Built on the shared transaction engine; this
 * screen only adds what's specific to a supplier receipt: supplier & purchase order in
 * the header, loading a PO's open lines, and how saving maps to the API (draft vs post).
 */
export default function MaterialReceiptEntryPage({
  receiptId,
}: {
  receiptId?: string
}) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const formatMoney = useFormatMoney()
  const branchName = useBranchName()
  const dispatch = useDispatch<AppDispatch>()
  const confirm = useConfirm()

  const catalog = useCatalogProductSource()
  const stock = useCatalogStockSource()
  const products = useMemo(() => receivableSource(catalog), [catalog])
  const {
    data: voucher,
    isLoading,
    error,
  } = useGetMaterialReceiptQuery(receiptId as string, { skip: !receiptId })
  const { data: settings } = useGetManufacturingSettingsQuery()
  const { data: filterOptions } = useGetOrderFilterOptionsQuery()
  const [saveReceipt] = useSaveMaterialReceiptMutation()
  const [deleteReceipt] = useDeleteMaterialReceiptMutation()

  useEffect(() => {
    void dispatch(fetchSuppliers({ page: 1, limit: 1000 }))
  }, [dispatch])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supplierData = useSelector((s: RootState) => s.supplier.data) as any
  const suppliers = useMemo(
    () =>
      (
        (supplierData?.results || []) as {
          id?: string
          _id?: string
          name: string
          phone?: string
        }[]
      ).map((s) => ({
        value: String(s.id || s._id),
        label: s.name,
        sublabel: s.phone,
      })),
    [supplierData]
  )

  const storeRef = useRef<EntryStore<ReceiptRow, ReceiptHeader> | null>(null)
  // The draft this screen is editing — set after a first save so later saves update it.
  const draftIdRef = useRef<string | null>(receiptId ?? null)
  const [supplierId, setSupplierId] = useState<string | null>(null)
  const { data: poData } = useGetPurchaseOrdersQuery(
    { supplier: supplierId, limit: 100, sortBy: 'createdAt:desc' },
    { skip: !supplierId }
  )
  const openOrders = useMemo(
    () =>
      (poData?.results || []).filter((po: PurchaseOrder) =>
        OPEN_PO.includes(po.status)
      ),
    [poData]
  )

  const locations = useMemo(() => {
    const list = [
      settings?.defaultSourceLocation,
      ...(filterOptions?.warehouses || []),
    ].filter((l): l is string => !!l)
    return [...new Set(list)]
  }, [settings, filterOptions])

  /** A purchase order's still-open lines → rows (quantity = what's left to receive). */
  const loadOrderLines = useCallback(
    async (poId: string) => {
      const store = storeRef.current
      if (!store) return
      try {
        const po = await dispatch(
          purchaseOrderApi.endpoints.getPurchaseOrder.initiate(poId)
        ).unwrap()
        let missing = 0
        const rows = po.items
          .map((item) => {
            const remaining = Math.max(
              0,
              Number(item.quantity || 0) - Number(item.receivedQuantity || 0)
            )
            if (remaining <= 0) return null
            const productId = String(
              item.product?._id || item.product?.id || item.product
            )
            const variantId = item.variantId
              ? String(item.variantId?._id || item.variantId)
              : null
            const product =
              (variantId && products.getByKey?.(variantId)) ||
              products.getByKey?.(productId)
            if (!product) {
              missing += 1
              return null
            }
            const gross = remaining * Number(item.expectedPrice || 0)
            const discountPercent =
              item.discountType === 'percentage'
                ? Number(item.discountValue || 0)
                : gross > 0
                  ? Math.round(
                      (Number(item.discountAmount || 0) /
                        (Number(item.quantity || 0) *
                          Number(item.expectedPrice || 0) || 1)) *
                        10000
                    ) / 100
                  : 0
            const row: ReceiptRow = {
              ...blankReceiptRow(),
              id: '',
              product,
              productType:
                (product.raw as { productType?: ReceiptRow['productType'] })
                  ?.productType ?? null,
              unit: product.unit,
              quantity: remaining,
              rate: Number(item.expectedPrice || 0),
              discountPercent: discountPercent || null,
            }
            return computeReceiptLine(row)
          })
          .filter((r): r is ReceiptRow => !!r)
        const ids = store.appendRows(rows.map(({ id: _id, ...r }) => r))
        toast.success(
          `${ids.length} ${t('open line(s) loaded from')} ${po.orderNumber}${missing ? ` · ${missing} ${t('not in this branch’s catalog')}` : ''}`
        )
      } catch (err) {
        toast.error(
          getErrorMessage(err, t('Could not load the purchase order'))
        )
      }
    },
    [dispatch, products, t]
  )

  const headerFields = useMemo<HeaderField<ReceiptHeader>[]>(
    () => [
      {
        key: 'voucherNumber',
        label: 'Voucher Number',
        kind: 'custom',
        render: ({ value }) => (
          <div className='bg-muted/40 flex h-9 items-center rounded-md border px-3 font-mono text-sm'>
            {(value as string) || (
              <span className='text-muted-foreground font-sans'>
                {t('Assigned on save')}
              </span>
            )}
          </div>
        ),
      },
      { key: 'date', label: 'Date', kind: 'date', required: true },
      {
        key: 'supplierId',
        label: 'Supplier',
        kind: 'custom',
        required: true,
        render: ({ value, onChange, id, next, error }) => (
          <SearchableSelect
            id={id}
            options={suppliers}
            value={(value as string) || ''}
            onValueChange={(v) => {
              onChange(v || null)
              setSupplierId(v || null)
            }}
            onSelected={next}
            placeholder={t('Choose supplier')}
            searchPlaceholder={t('Search suppliers…')}
            className={error ? 'border-destructive' : undefined}
          />
        ),
      },
      {
        key: 'purchaseOrderId',
        label: 'Purchase Order',
        kind: 'custom',
        render: ({ value, onChange, header, id, next }) => (
          <div className='flex gap-1.5'>
            <SearchableSelect
              id={id}
              options={openOrders.map((po) => ({
                value: String(po._id || po.id),
                label: po.orderNumber,
                sublabel: `${po.status} · ${fmtDate(po.orderDate)}`,
              }))}
              value={(value as string) || ''}
              onValueChange={(v) => onChange(v || null)}
              onSelected={next}
              disabled={!header.supplierId}
              placeholder={
                header.supplierId ? t('Optional') : t('Choose a supplier first')
              }
              emptyText={t('No open orders for this supplier')}
              clearLabel={t('No purchase order')}
              className='min-w-0 flex-1'
            />
            <Button
              type='button'
              variant='outline'
              size='icon'
              className='shrink-0'
              disabled={!value}
              title={t('Load the order’s open lines')}
              aria-label={t('Load the order’s open lines')}
              onClick={() => value && loadOrderLines(value as string)}
            >
              <ListPlus className='h-4 w-4' />
            </Button>
          </div>
        ),
      },
      {
        key: 'location',
        label: 'Warehouse',
        kind: 'custom',
        render: ({ value, onChange, id }) => (
          <>
            <Input
              id={id}
              list='rmv-locations'
              showVoiceInput={false}
              autoComplete='off'
              value={(value as string) || ''}
              placeholder={t('e.g. Raw Material Store')}
              onChange={(e) => onChange(e.target.value)}
            />
            <datalist id='rmv-locations'>
              {locations.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </>
        ),
      },
      {
        key: 'branch',
        label: 'Branch',
        kind: 'custom',
        render: () => (
          <div className='bg-muted/40 flex h-9 items-center truncate rounded-md border px-3 text-sm'>
            {branchName || t('Current branch')}
          </div>
        ),
      },
      {
        key: 'reference',
        label: 'Reference',
        kind: 'text',
        placeholder: 'Supplier bill / delivery note no.',
      },
      { key: 'notes', label: 'Notes', kind: 'textarea', span: 2 },
    ],
    [suppliers, openOrders, locations, branchName, loadOrderLines, t]
  )

  const config = useMemo(
    () =>
      createReceiptConfig({
        headerFields,
        locations,
        defaultLocation: settings?.defaultSourceLocation || '',
        formatMoney,
      }),
    [headerFields, locations, settings?.defaultSourceLocation, formatMoney]
  )

  const posted = voucher && voucher.status !== 'draft'
  const initial = useMemo(() => {
    if (!voucher) return undefined
    return {
      header: {
        voucherNumber: voucher.voucherNumber,
        date: String(voucher.date).slice(0, 10),
        supplierId: voucher.supplierId || null,
        purchaseOrderId: voucher.purchaseOrderId || null,
        location: voucher.location || '',
        branch: '',
        reference: voucher.reference || '',
        notes: voucher.notes || '',
      },
      rows: receiptToRows(voucher, catalog),
    }
    // Built once per loaded voucher; the catalog must be ready (see the gate below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voucher?.id, voucher?.updatedAt, catalog.loading])

  useEffect(() => {
    if (voucher?.supplierId) setSupplierId(voucher.supplierId)
  }, [voucher?.supplierId])

  const onSave = useCallback(
    async (
      { header, rows }: { header: ReceiptHeader; rows: ReceiptRow[] },
      mode: SaveMode
    ) => {
      const isDraft = mode === 'draft'
      try {
        const saved: MaterialReceipt = await saveReceipt({
          id: draftIdRef.current,
          date: header.date,
          supplierId: header.supplierId,
          purchaseOrderId: header.purchaseOrderId,
          location: header.location,
          reference: header.reference,
          notes: header.notes,
          lines: rows.map(rowToLine),
          confirm: !isDraft,
        }).unwrap()
        if (isDraft) {
          draftIdRef.current = saved.id
          storeRef.current?.setHeader({ voucherNumber: saved.voucherNumber })
          toast.success(
            `${t('Draft saved')} · ${saved.voucherNumber} — ${t('stock not changed yet')}`
          )
          if (!receiptId)
            navigate({ to: `${LIST}/${saved.id}` as never, replace: true })
          return
        }
        toast.success(
          `${saved.voucherNumber} ${t('posted')} · ${saved.totals.items} ${t('item(s) received into stock')}${
            saved.purchaseInvoiceNumber
              ? ` · ${t('purchase')} ${saved.purchaseInvoiceNumber}`
              : ''
          }`
        )
        draftIdRef.current = null
        if (mode === 'save-print') {
          if (!printMaterialReceipt(saved, { branchName, formatMoney, t }))
            toast.error(t('Allow pop-ups for this site to print'))
        }
        if (mode === 'save-new') {
          if (receiptId) navigate({ to: `${LIST}/new` as never })
          return
        }
        navigate({ to: `${LIST}/${saved.id}` as never, replace: true })
      } catch (err) {
        // A failed "Save" may still have kept the draft (and its number) — later saves
        // update that draft instead of creating another.
        const draftId = (err as { data?: { details?: { draftId?: string } } })
          ?.data?.details?.draftId
        if (draftId) draftIdRef.current = draftId
        const rowErrors = rowErrorsFromApi(err, rows, {
          product: 'product',
          serials: 'serials',
        })
        if (rowErrors) {
          toast.error(t('Some lines need attention — nothing was posted'))
          return { rowErrors }
        }
        throw err
      }
    },
    [saveReceipt, navigate, receiptId, branchName, formatMoney, t]
  )

  const title = posted
    ? `${t('Raw material receipt')} ${voucher!.voucherNumber}`
    : receiptId
      ? t('Edit draft receipt')
      : t('New raw material receipt')

  if (receiptId && (isLoading || catalog.loading))
    return <Skeleton className='h-96 w-full rounded-xl' />
  if (receiptId && !voucher) {
    return (
      <div className='text-muted-foreground rounded-xl border p-10 text-center text-sm'>
        {getErrorMessage(error, t('Receipt not found'))}
      </div>
    )
  }
  if (!receiptId && catalog.loading)
    return <Skeleton className='h-96 w-full rounded-xl' />

  return (
    <div className='space-y-4'>
      <nav
        aria-label={t('Breadcrumb')}
        className='text-muted-foreground flex items-center gap-1.5 text-sm'
      >
        <Link
          to={LIST as never}
          className='hover:text-foreground inline-flex items-center gap-1'
        >
          <ArrowLeft className='h-3.5 w-3.5' aria-hidden />
          {t('Raw material receipts')}
        </Link>
      </nav>
      <PageHeader
        title={
          <span className='flex flex-wrap items-center gap-2'>
            {title}
            {voucher && (
              <Badge
                variant='outline'
                className={
                  voucher.status === 'confirmed'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                }
              >
                {voucher.status === 'confirmed' ? t('Posted') : t('Draft')}
              </Badge>
            )}
          </span>
        }
        description={
          posted
            ? `${t('Received into stock on')} ${fmtDate(voucher!.confirmedAt)}${
                voucher!.purchaseInvoiceNumber
                  ? ` · ${t('purchase')} ${voucher!.purchaseInvoiceNumber}`
                  : ''
              }`
            : t(
                'Receive raw materials, components and packaging from a supplier. A draft doesn’t change stock; Save posts it.'
              )
        }
        actions={
          voucher ? (
            <div className='flex gap-2'>
              <Button
                variant='outline'
                onClick={() => {
                  if (
                    !printMaterialReceipt(voucher, {
                      branchName,
                      formatMoney,
                      t,
                    })
                  )
                    toast.error(t('Allow pop-ups for this site to print'))
                }}
              >
                <Printer className='mr-2 h-4 w-4' />
                {t('Print')}
              </Button>
              {voucher.status === 'draft' && (
                <Button
                  variant='outline'
                  className='text-destructive'
                  onClick={async () => {
                    const ok = await confirm({
                      title: t('Delete draft {{n}}?').replace(
                        '{{n}}',
                        voucher.voucherNumber
                      ),
                      description: t(
                        'The draft is removed. Stock was never changed by it.'
                      ),
                      confirmText: t('Delete'),
                      destructive: true,
                    })
                    if (!ok) return
                    try {
                      await deleteReceipt(voucher.id).unwrap()
                      toast.success(t('Draft deleted'))
                      navigate({ to: LIST as never })
                    } catch (err) {
                      toast.error(getErrorMessage(err, t('Delete failed')))
                    }
                  }}
                >
                  <Trash2 className='mr-2 h-4 w-4' />
                  {t('Delete draft')}
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      <TransactionEntry<ReceiptRow, ReceiptHeader>
        key={voucher ? `${voucher.id}-${voucher.status}` : 'new'}
        config={config}
        products={products}
        stock={stock}
        initial={initial}
        readOnly={!!posted}
        storeRef={storeRef}
        draft={receiptId ? false : { key: 'material-receipt:new' }}
        onSave={onSave}
        saveLabel={t('Save')}
        saveActions={[
          { mode: 'draft', label: 'Save Draft', validate: false },
          { mode: 'save-print', label: 'Save & Print' },
        ]}
        footerExtra={
          <Button
            type='button'
            variant='ghost'
            onClick={async () => {
              const store = storeRef.current
              if (store && store.filledRows().length && !posted) {
                const ok = await confirm({
                  title: t('Leave this receipt?'),
                  description: receiptId
                    ? t('Changes since the last save are discarded.')
                    : t(
                        'An unsaved new receipt stays as a local draft on this device until you discard it.'
                      ),
                  confirmText: t('Leave'),
                })
                if (!ok) return
              }
              navigate({ to: LIST as never })
            }}
          >
            {posted ? t('Close') : t('Cancel')}
          </Button>
        }
      />
    </div>
  )
}
