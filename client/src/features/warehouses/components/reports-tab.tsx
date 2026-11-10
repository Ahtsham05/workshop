import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useSelector } from 'react-redux'
import { ArrowLeftRight, BarChart3, Boxes, Download, FileText, Hourglass, Layers, Loader2, Printer, Search, ShoppingCart, Wallet, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLanguage } from '@/context/language-context'
import { useCurrencyMeta } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { ReportView } from '@/features/manufacturing/components/report-view'
import { exportReportToExcel } from '@/features/manufacturing/lib/report-excel'
import { generateReportHTML } from '@/features/manufacturing/lib/report-print'
import { openPrintWindowForFormat } from '@/features/invoice/utils/print-utils'
import { useGetBranchQuery } from '@/stores/branch.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import type { RootState } from '@/stores/store'
import { resolveBranchCompanyName } from '@/utils/branch-company-name'
import { useGetWarehouseReportQuery, useGetWarehouseStockQuery, useGetWarehousesQuery, type WarehouseReportKey } from '@/stores/warehouse.api'
import { buildWarehouseReportDoc } from '../reports/report-docs'

const ALL = '__all__'

const REPORTS: { key: WarehouseReportKey; title: string; description: string; icon: typeof Wallet; dated: boolean; perWarehouse: boolean }[] = [
  { key: 'valuation', title: 'Stock Valuation', description: 'Units, cost and retail value per warehouse and category', icon: Wallet, dated: false, perWarehouse: false },
  { key: 'summary', title: 'Stock Summary', description: 'Opening · in · out · closing per warehouse and product', icon: BarChart3, dated: true, perWarehouse: true },
  { key: 'ledger', title: 'Stock Ledger', description: 'Every movement of one product with running balance', icon: FileText, dated: true, perWarehouse: true },
  { key: 'transfers', title: 'Transfer Register', description: 'Every move between warehouses and bins', icon: ArrowLeftRight, dated: true, perWarehouse: true },
  { key: 'sales', title: 'Sales by Warehouse', description: 'Invoices, units, sales and profit per warehouse', icon: ShoppingCart, dated: true, perWarehouse: false },
  { key: 'purchases', title: 'Purchases by Warehouse', description: 'What each warehouse received from suppliers', icon: Boxes, dated: true, perWarehouse: false },
  { key: 'ageing', title: 'Stock Ageing', description: 'How long stock has sat in each warehouse', icon: Hourglass, dated: false, perWarehouse: true },
  { key: 'bins', title: 'Stock by Bin', description: 'Bin-wise list — prints as a pick / count sheet', icon: Layers, dated: false, perWarehouse: true },
]

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const PRESETS: { key: string; label: string; range: () => [string, string] }[] = [
  { key: 'today', label: 'Today', range: () => [ymd(new Date()), ymd(new Date())] },
  { key: 'week', label: 'Last 7 days', range: () => [ymd(new Date(Date.now() - 6 * 86400000)), ymd(new Date())] },
  { key: 'month', label: 'This month', range: () => { const n = new Date(); return [ymd(new Date(n.getFullYear(), n.getMonth(), 1)), ymd(n)] } },
  { key: 'lastMonth', label: 'Last month', range: () => { const n = new Date(); return [ymd(new Date(n.getFullYear(), n.getMonth() - 1, 1)), ymd(new Date(n.getFullYear(), n.getMonth(), 0))] } },
  { key: 'year', label: 'This year', range: () => { const n = new Date(); return [ymd(new Date(n.getFullYear(), 0, 1)), ymd(n)] } },
]

/** Warehouses → Reports: the warehouse-wise reports, printable and exportable. */
export function ReportsTab() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { report?: WarehouseReportKey; tab?: string }
  const report: WarehouseReportKey = REPORTS.some((r) => r.key === search.report) ? (search.report as WarehouseReportKey) : 'valuation'
  const meta = REPORTS.find((r) => r.key === report)!
  const setReport = (key: WarehouseReportKey) => navigate({ to: '/warehouses', search: { tab: 'reports', report: key } as never, replace: true })

  const [preset, setPreset] = useState('month')
  const [[from, to], setRange] = useState<[string, string]>(PRESETS[2].range())
  const [warehouseId, setWarehouseId] = useState(ALL)
  const [status, setStatus] = useState('all')
  const [text, setText] = useState('')
  const [debounced, setDebounced] = useState('')
  const [product, setProduct] = useState<{ productId: string; variantId: string | null; name: string } | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [productDebounced, setProductDebounced] = useState('')

  useEffect(() => {
    const id = setTimeout(() => setDebounced(text.trim()), 300)
    return () => clearTimeout(id)
  }, [text])
  useEffect(() => {
    const id = setTimeout(() => setProductDebounced(productSearch.trim()), 250)
    return () => clearTimeout(id)
  }, [productSearch])

  const { data: warehouses = [] } = useGetWarehousesQuery(undefined)
  const { data: productHits, isFetching: productFetching } = useGetWarehouseStockQuery(
    { search: productDebounced, filter: 'all', limit: 10 },
    { skip: report !== 'ledger' || !productDebounced }
  )

  const params = {
    report,
    ...(meta.dated ? { from, to } : {}),
    ...(meta.perWarehouse && warehouseId !== ALL ? { warehouseId } : {}),
    ...(report === 'summary' && debounced ? { search: debounced } : {}),
    ...(report === 'transfers' ? { status } : {}),
    ...(report === 'ledger' && product ? { productId: product.productId, ...(product.variantId ? { variantId: product.variantId } : {}) } : {}),
  }
  const skip = report === 'ledger' && !product
  const { data, isFetching, error } = useGetWarehouseReportQuery(params, { skip })

  const { symbol: currency } = useCurrencyMeta()
  const figure = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const warehouseName = warehouseId !== ALL ? warehouses.find((w) => w.id === warehouseId)?.name : undefined
  const doc = useMemo(
    () => (data ? buildWarehouseReportDoc(report, data, { t, figure, currency, from: meta.dated ? from : undefined, to: meta.dated ? to : undefined, warehouseName: meta.perWarehouse ? warehouseName : undefined }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, report, t, currency, from, to, warehouseName]
  )

  const activeBranchId = useSelector((s: RootState) => s.auth.activeBranchId)
  const user = useSelector((s: RootState) => s.auth.data?.user)
  const { data: branch } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const { data: org } = useGetMyOrganizationQuery(undefined)
  const companyName = resolveBranchCompanyName(org?.name, branch?.name) || org?.name

  const print = () => {
    if (!doc) return
    try {
      openPrintWindowForFormat(
        generateReportHTML(
          doc,
          {
            companyName,
            companyAddress: [branch?.location?.address, branch?.location?.city].filter(Boolean).join(', '),
            companyPhone: branch?.phone,
            companyLogo: org?.logo?.url,
            branchName: branch?.name,
            preparedBy: user?.name,
          },
          t
        ),
        'a4'
      )
    } catch {
      toast.error(t('Allow pop-ups to print'))
    }
  }

  return (
    <div className='grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]'>
      <Card className='h-fit gap-1 p-2 max-lg:hidden'>
        {REPORTS.map((r) => (
          <button
            key={r.key}
            type='button'
            onClick={() => setReport(r.key)}
            className={cn('flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition', r.key === report ? 'bg-primary/10 text-primary' : 'hover:bg-muted')}
          >
            <r.icon className='mt-0.5 h-4 w-4 shrink-0' />
            <span className='min-w-0'>
              <span className='block text-sm font-medium'>{t(r.title)}</span>
              <span className='block text-[11px] leading-snug text-muted-foreground'>{t(r.description)}</span>
            </span>
          </button>
        ))}
      </Card>

      <div className='min-w-0 space-y-3'>
        <Card className='flex-row flex-wrap items-end gap-3 p-3'>
          <div className='w-full space-y-1 lg:hidden'>
            <Label className='text-xs'>{t('Report')}</Label>
            <Select value={report} onValueChange={(v) => setReport(v as WarehouseReportKey)}>
              <SelectTrigger className='h-9 w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORTS.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {t(r.title)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {meta.dated ? (
            <>
              <div className='space-y-1'>
                <Label className='text-xs'>{t('Period')}</Label>
                <Select
                  value={preset}
                  onValueChange={(v) => {
                    setPreset(v)
                    const p = PRESETS.find((x) => x.key === v)
                    if (p) setRange(p.range())
                  }}
                >
                  <SelectTrigger className='h-9 w-36'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRESETS.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {t(p.label)}
                      </SelectItem>
                    ))}
                    <SelectItem value='custom'>{t('Custom')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-1'>
                <Label className='text-xs'>{t('From')}</Label>
                <Input type='date' className='h-9 w-40' value={from} onChange={(e) => { setPreset('custom'); setRange([e.target.value, to]) }} />
              </div>
              <div className='space-y-1'>
                <Label className='text-xs'>{t('To')}</Label>
                <Input type='date' className='h-9 w-40' value={to} onChange={(e) => { setPreset('custom'); setRange([from, e.target.value]) }} />
              </div>
            </>
          ) : null}
          {meta.perWarehouse ? (
            <div className='space-y-1'>
              <Label className='text-xs'>{t('Warehouse')}</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className='h-9 w-48'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t('All warehouses')}</SelectItem>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {report === 'summary' ? (
            <div className='space-y-1'>
              <Label className='text-xs'>{t('Product')}</Label>
              <div className='relative'>
                <Search className='absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Name, SKU or barcode')} className='h-9 w-56 pl-8' />
              </div>
            </div>
          ) : null}
          {report === 'transfers' ? (
            <div className='space-y-1'>
              <Label className='text-xs'>{t('Status')}</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className='h-9 w-36'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>{t('Draft + done')}</SelectItem>
                  <SelectItem value='done'>{t('Done')}</SelectItem>
                  <SelectItem value='draft'>{t('Draft')}</SelectItem>
                  <SelectItem value='cancelled'>{t('Cancelled')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {report === 'ledger' ? (
            <div className='relative space-y-1'>
              <Label className='text-xs'>{t('Product')}</Label>
              {product ? (
                <div className='flex h-9 items-center gap-2 rounded-md border px-3 text-sm'>
                  <span className='max-w-[260px] truncate font-medium'>{product.name}</span>
                  <button type='button' onClick={() => setProduct(null)} className='text-muted-foreground hover:text-foreground' aria-label={t('Clear')}>
                    <X className='h-3.5 w-3.5' />
                  </button>
                </div>
              ) : (
                <>
                  <div className='relative'>
                    <Search className='absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                    <Input autoFocus value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder={t('Search a product…')} className='h-9 w-64 pl-8' />
                    {productFetching ? <Loader2 className='absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground' /> : null}
                  </div>
                  {productDebounced && productHits ? (
                    <div className='absolute z-20 mt-1 max-h-64 w-80 overflow-y-auto rounded-md border bg-popover shadow-md'>
                      {productHits.results.length === 0 ? (
                        <p className='p-3 text-sm text-muted-foreground'>{t('No product matches')}</p>
                      ) : (
                        productHits.results.map((r) => (
                          <button
                            key={`${r.productId}|${r.variantId || ''}`}
                            type='button'
                            onClick={() => {
                              setProduct({ productId: r.productId, variantId: r.variantId, name: r.name })
                              setProductSearch('')
                            }}
                            className='flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted'
                          >
                            <span className='truncate'>{r.name}</span>
                            <span className='shrink-0 text-xs text-muted-foreground'>{r.sku}</span>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
          <div className='ml-auto flex gap-2'>
            <Button variant='outline' size='sm' className='h-9' disabled={!doc} onClick={() => doc && exportReportToExcel(doc, { companyName, branchName: branch?.name })}>
              <Download className='mr-2 h-4 w-4' />
              {t('Excel')}
            </Button>
            <Button size='sm' className='h-9' disabled={!doc} onClick={print}>
              <Printer className='mr-2 h-4 w-4' />
              {t('Print')}
            </Button>
          </div>
        </Card>

        {skip ? (
          <Card className='items-center gap-2 p-10 text-center text-muted-foreground'>
            <FileText className='h-8 w-8' />
            <p>{t('Search and pick a product to see its stock ledger in every warehouse.')}</p>
          </Card>
        ) : error ? (
          <Card className='p-10 text-center text-sm text-destructive'>{t('Could not load the report.')}</Card>
        ) : !doc ? (
          <div className='py-16 text-center'>
            <Loader2 className='mx-auto h-6 w-6 animate-spin text-muted-foreground' />
          </div>
        ) : (
          <div className={cn('transition-opacity', isFetching && 'opacity-60')}>
            <ReportView doc={doc} companyName={companyName} branchName={branch?.name} />
          </div>
        )}
      </div>
    </div>
  )
}
