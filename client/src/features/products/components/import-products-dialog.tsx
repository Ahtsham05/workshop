import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Package, Building2, ScanLine } from 'lucide-react'
import { toast } from 'sonner'
import { useLanguage } from '@/context/language-context'
import { generateBatchNumber } from './variants/generate-variant-combinations'
import { ImportSerialEntryDialog } from './import-serial-entry-dialog'
import {
  useGetImportableMasterProductsQuery,
  useImportMasterProductsMutation,
  type ImeiEntry,
  type ImportableMasterProduct,
} from '@/stores/masterProduct.api'

interface ImportProductsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported?: () => void
}

interface RowState {
  price: number
  cost: number
  stockQuantity: number
  batchNumber: string
  imeis: ImeiEntry[]
}

export function ImportProductsDialog({ open, onOpenChange, onImported }: ImportProductsDialogProps) {
  const { t } = useLanguage()
  const { data: importable = [], isFetching } = useGetImportableMasterProductsQuery(undefined, { skip: !open })
  const [importMasterProducts, { isLoading: importing }] = useImportMasterProductsMutation()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [overrides, setOverrides] = useState<Record<string, RowState>>({})
  const [serialDialogRowId, setSerialDialogRowId] = useState<string | null>(null)

  // Reset selection each time the dialog opens fresh, rather than carrying over a
  // previous session's picks silently.
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set())
      setOverrides({})
      setSerialDialogRowId(null)
    }
  }, [open])

  const valueFor = (row: ImportableMasterProduct): RowState =>
    overrides[row.masterProductId] ?? { price: row.suggestedPrice, cost: row.suggestedCost, stockQuantity: 0, batchNumber: '', imeis: [] }

  const setRow = (id: string, next: RowState) => setOverrides((prev) => ({ ...prev, [id]: next }))

  // Opening-batch identity only matters once there's actually opening stock to seed —
  // same "auto-suggest the moment it becomes relevant" UX as the batch number field in
  // users-action-dialog.tsx, just triggered by qty going from 0 to non-zero instead of a
  // checkbox toggle.
  const setStockQuantity = (row: ImportableMasterProduct, qty: number) => {
    const v = valueFor(row)
    const needsBatch = (row.trackBatch || row.trackExpiry) && qty > 0 && !v.batchNumber
    setRow(row.masterProductId, { ...v, stockQuantity: qty, batchNumber: needsBatch ? generateBatchNumber() : v.batchNumber })
  }

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = importable.length > 0 && selectedIds.size === importable.length
  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(importable.map((r) => r.masterProductId)))
  }

  const selectedCount = selectedIds.size
  const serialDialogRow = importable.find((r) => r.masterProductId === serialDialogRowId)

  const handleImport = async () => {
    const rows = importable.filter((row) => selectedIds.has(row.masterProductId))

    // Fail fast client-side with a specific, per-product message — same requirement the
    // server enforces too (masterProduct.service.js#importMasterProducts), checked here
    // first so a mistake doesn't cost a round trip.
    for (const row of rows) {
      const v = valueFor(row)
      if (v.stockQuantity <= 0) continue
      if ((row.trackImei || row.trackSerial) && v.imeis.length !== v.stockQuantity) {
        toast.error(`Enter ${v.stockQuantity} ${row.trackSerial ? 'serial' : 'IMEI'} number(s) for "${row.name}" — ${v.imeis.length} entered`)
        return
      }
      if ((row.trackBatch || row.trackExpiry) && !v.batchNumber.trim()) {
        toast.error(`Enter a batch number for the opening stock of "${row.name}"`)
        return
      }
    }

    const items = rows.map((row) => {
      const v = valueFor(row)
      return {
        masterProductId: row.masterProductId,
        price: Number(v.price) || 0,
        cost: Number(v.cost) || 0,
        stockQuantity: Number(v.stockQuantity) || 0,
        batchNumber: v.batchNumber.trim() || undefined,
        imeis: v.imeis.length ? v.imeis : undefined,
      }
    })
    if (items.length === 0) return

    try {
      await importMasterProducts(items).unwrap()
      toast.success(t('products_imported_success', { count: String(items.length) }))
      onImported?.()
      onOpenChange(false)
    } catch {
      toast.error(t('products_import_failed'))
    }
  }

  const emptyState = useMemo(() => {
    if (isFetching) return null
    if (importable.length === 0) {
      return (
        <div className='flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground'>
          <Building2 className='h-8 w-8 text-muted-foreground/50' />
          {t('no_importable_products')}
        </div>
      )
    }
    return null
  }, [isFetching, importable, t])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-5xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2 text-base'>
            <Building2 className='h-4 w-4 text-blue-600' />
            {t('import_from_other_branches')}
          </DialogTitle>
          <DialogDescription>{t('import_from_other_branches_desc')}</DialogDescription>
        </DialogHeader>

        {isFetching ? (
          <div className='flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground'>
            <Loader2 className='h-4 w-4 animate-spin' /> {t('loading')}
          </div>
        ) : emptyState ? (
          emptyState
        ) : (
          <ScrollArea className='max-h-[420px]'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-8'>
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label={t('select_all')} />
                  </TableHead>
                  <TableHead>{t('product_name')}</TableHead>
                  <TableHead>{t('carried_at')}</TableHead>
                  <TableHead className='w-24'>{t('opening_qty')}</TableHead>
                  <TableHead className='w-36'>Batch / Serial</TableHead>
                  <TableHead className='w-28'>{t('price')}</TableHead>
                  <TableHead className='w-28'>{t('cost')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importable.map((row) => {
                  const checked = selectedIds.has(row.masterProductId)
                  const v = valueFor(row)
                  const needsBatch = (row.trackBatch || row.trackExpiry) && v.stockQuantity > 0
                  const needsSerial = (row.trackImei || row.trackSerial) && v.stockQuantity > 0
                  return (
                    <TableRow key={row.masterProductId} className={checked ? 'bg-muted/40' : undefined}>
                      <TableCell>
                        <Checkbox checked={checked} onCheckedChange={() => toggleOne(row.masterProductId)} />
                      </TableCell>
                      <TableCell>
                        <div className='flex items-center gap-2'>
                          {row.image?.url ? (
                            <img src={row.image.url} alt={row.name} className='h-8 w-8 shrink-0 rounded object-cover' />
                          ) : (
                            <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted'>
                              <Package className='h-4 w-4 text-muted-foreground' />
                            </div>
                          )}
                          <div className='min-w-0'>
                            <div className='truncate text-sm font-medium'>{row.name}</div>
                            {row.category ? (
                              <Badge variant='secondary' className='mt-0.5 px-1.5 py-0 text-[10px]'>
                                {row.category}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className='text-xs text-muted-foreground'>{row.carriedAtBranches.join(', ')}</TableCell>
                      <TableCell>
                        <Input
                          type='number'
                          min={0}
                          value={v.stockQuantity}
                          onChange={(e) => setStockQuantity(row, Number(e.target.value))}
                          className='h-8 text-sm'
                        />
                      </TableCell>
                      <TableCell>
                        {needsBatch ? (
                          <Input
                            placeholder='Batch number'
                            value={v.batchNumber}
                            onChange={(e) => setRow(row.masterProductId, { ...v, batchNumber: e.target.value })}
                            className='h-8 text-sm'
                          />
                        ) : needsSerial ? (
                          <button
                            type='button'
                            onClick={() => setSerialDialogRowId(row.masterProductId)}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                              v.imeis.length >= v.stockQuantity
                                ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400'
                                : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400'
                            }`}
                          >
                            <ScanLine className='h-3 w-3' />
                            {v.imeis.length}/{v.stockQuantity}
                          </button>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Input
                          type='number'
                          min={0}
                          value={v.price}
                          onChange={(e) => setRow(row.masterProductId, { ...v, price: Number(e.target.value) })}
                          className='h-8 text-sm'
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type='number'
                          min={0}
                          value={v.cost}
                          onChange={(e) => setRow(row.masterProductId, { ...v, cost: Number(e.target.value) })}
                          className='h-8 text-sm'
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={handleImport} disabled={selectedCount === 0 || importing}>
            {importing ? <Loader2 className='h-4 w-4 animate-spin' /> : null}
            {t('import_n_products', { count: String(selectedCount) })}
          </Button>
        </DialogFooter>
      </DialogContent>

      {serialDialogRow && (
        <ImportSerialEntryDialog
          open={!!serialDialogRowId}
          onOpenChange={(next) => setSerialDialogRowId(next ? serialDialogRowId : null)}
          productName={serialDialogRow.name}
          isSerial={!!serialDialogRow.trackSerial}
          targetCount={valueFor(serialDialogRow).stockQuantity}
          value={valueFor(serialDialogRow).imeis}
          onChange={(next) => setRow(serialDialogRow.masterProductId, { ...valueFor(serialDialogRow), imeis: next })}
        />
      )}
    </Dialog>
  )
}
