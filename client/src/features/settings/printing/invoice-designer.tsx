import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Loader2, RotateCcw, Type, LayoutTemplate, Eye, PenLine, Palette, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ColorField } from '@/components/color-field'
import { useCurrencyMeta } from '@/lib/format-money'
import { INVOICE_TEMPLATE_OPTIONS, type InvoiceTemplate } from '@/features/invoice/utils/invoice-template'
import { generateA4InvoiceHTML, type PrintInvoiceData } from '@/features/invoice/utils/print-utils'
import { PRINT_COLOR_KEYS, PRINT_COLOR_PRESETS, withPrintColors, type PrintColors } from '@/lib/print-colors'
import {
  EMPTY_DESIGN,
  FONT_OPTIONS,
  LAYOUT_CHOICES,
  SHOW_FIELDS,
  SIZE_FIELDS,
  withPrintDesign,
  type PrintDesign,
  type SheetKind,
  type SizeKey,
} from '@/lib/print-design'

/* ── Sample invoice: long enough to show every section the designer controls ── */

const SAMPLE: PrintInvoiceData = {
  invoiceNumber: 'INV-202610-000457',
  items: [
    { name: 'Samsung Galaxy A55 128GB', quantity: 1, unitPrice: 112000, subtotal: 112000 },
    { name: 'Fast Charger 25W', quantity: 2, unitPrice: 2500, subtotal: 5000 },
    { name: 'Type-C Cable 1m', quantity: 3, unitPrice: 400, subtotal: 1200 },
    { name: 'Silicone Case', quantity: 1, unitPrice: 800, subtotal: 800 },
    { name: 'Tempered Glass Protector', quantity: 2, unitPrice: 600, subtotal: 1200 },
  ],
  customerId: 'sample-customer',
  customerName: 'Ali Raza Traders',
  type: 'credit',
  subtotal: 120200,
  tax: 0,
  discount: 1200,
  total: 119000,
  paidAmount: 50000,
  balance: 69000,
  previousBalance: 15000,
  notes: 'Goods once sold will not be taken back. Warranty as per manufacturer policy.',
  companyName: 'Your Business Name',
  companyAddress: '12-B Main Boulevard, Gulberg III, Lahore',
  companyPhone: '042-35761234',
  companyLogo: '/images/logo-light.png',
} as PrintInvoiceData

const PAGE = { a4: { w: 794, h: 1123 }, a5: { w: 559, h: 794 } } as const

const previewOnly = (html: string) =>
  html.replace(
    '</head>',
    '<style>.no-print{display:none!important}body{max-width:none!important;margin:0!important;box-shadow:none!important;border-radius:0!important}</style></head>'
  )

/* ── Small controls ──────────────────────────────────────────────────────── */

function Group({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className='space-y-2.5'>
      <div>
        <h4 className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>{title}</h4>
        {hint && <p className='mt-0.5 text-xs text-muted-foreground'>{hint}</p>}
      </div>
      {children}
    </section>
  )
}

/* Short labels for the segmented buttons (the full wording lives in LAYOUT_CHOICES). */
const SHORT: Partial<Record<keyof typeof LAYOUT_CHOICES, Record<string, string>>> = {
  margins: { template: 'Default', narrow: 'Narrow', normal: 'Normal', wide: 'Wide' },
  corners: { template: 'Default', rounded: 'Rounded', square: 'Square' },
  rowDensity: { template: 'Default', compact: 'Compact', comfortable: 'Normal', spacious: 'Spacious' },
  zebra: { template: 'Default', on: 'Striped', off: 'Plain' },
  totalsWidth: { template: 'Default', narrow: 'Narrow', half: 'Half', full: 'Full' },
  signatures: { auto: 'Template', show: 'Always', hide: 'Never' },
  nameCase: { template: 'Default', normal: 'As typed', uppercase: 'CAPITALS' },
  rowWeight: { template: 'Default', normal: 'Regular', medium: 'Medium', bold: 'Bold' },
}

function FieldLabel({ label, changed, onReset, hint }: { label: string; changed: boolean; onReset?: () => void; hint?: string }) {
  return (
    <div className='flex items-center justify-between gap-2'>
      <span className='text-sm font-medium'>
        {label}
        {hint && <span className='ms-1.5 text-xs font-normal text-muted-foreground'>{hint}</span>}
      </span>
      {changed && onReset && (
        <button type='button' onClick={onReset} className='flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground'>
          <RotateCcw className='size-3' /> Default
        </button>
      )}
    </div>
  )
}

/** A row of equal buttons — one tap, every option visible, the current one highlighted. */
function Segmented<K extends keyof typeof LAYOUT_CHOICES>({
  label,
  choice,
  value,
  onChange,
}: {
  label: string
  choice: K
  value: (typeof LAYOUT_CHOICES)[K][number]['value']
  onChange: (v: (typeof LAYOUT_CHOICES)[K][number]['value']) => void
}) {
  const options = LAYOUT_CHOICES[choice] as readonly { value: string; label: string }[]
  const short: Record<string, string> = SHORT[choice] ?? {}
  const first = options[0].value
  return (
    <div className='space-y-1.5'>
      <FieldLabel label={label} changed={value !== first} onReset={() => onChange(first as typeof value)} />
      <div role='radiogroup' aria-label={label} className='grid gap-1 rounded-lg border bg-muted/40 p-1' style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => {
          const active = o.value === value
          return (
            <button
              key={o.value}
              type='button'
              role='radio'
              aria-checked={active}
              title={o.label}
              onClick={() => onChange(o.value as typeof value)}
              className={cn(
                'min-w-0 truncate rounded-md px-1.5 py-1.5 text-xs font-medium transition-colors',
                active ? 'bg-background text-foreground shadow-sm ring-1 ring-primary/40' : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                o.value === first && !active && 'italic'
              )}
            >
              {short[o.value] ?? o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* Mini drawings for picture tiles. `b` = the business block, `i` = the invoice block. */
const Bar = ({ w, strong }: { w: string; strong?: boolean }) => (
  <span className={cn('block h-1 rounded-full', strong ? 'h-1.5 bg-current' : 'bg-current/40')} style={{ width: w }} />
)

function HeaderSketch({ kind }: { kind: string }) {
  if (kind === 'template') return <Sparkles className='size-5 opacity-60' />
  const business = (
    <span className={cn('flex flex-col gap-0.5', kind === 'centered' ? 'items-center' : kind === 'reversed' ? 'items-end' : 'items-start')}>
      <span className='mb-0.5 block size-2.5 rounded-sm bg-current/50' />
      <Bar w='28px' strong />
      <Bar w='20px' />
    </span>
  )
  const invoice = (
    <span className={cn('flex flex-col gap-0.5', kind === 'centered' ? 'items-center' : kind === 'reversed' ? 'items-start' : 'items-end')}>
      <Bar w='16px' strong />
      <Bar w='14px' />
      <Bar w='12px' />
    </span>
  )
  if (kind === 'centered') return <span className='flex w-full flex-col items-center gap-1'>{business}{invoice}</span>
  return <span className='flex w-full items-start justify-between'>{kind === 'reversed' ? <>{invoice}{business}</> : <>{business}{invoice}</>}</span>
}

function LinesSketch({ kind }: { kind: string }) {
  if (kind === 'template') return <Sparkles className='size-5 opacity-60' />
  return (
    <span className={cn('grid w-full grid-cols-3 overflow-hidden', kind === 'grid' && 'border border-current/60')}>
      {Array.from({ length: 9 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'h-2.5',
            i < 3 && 'bg-current/25',
            kind === 'grid' && 'border border-current/40',
            kind === 'rows' && 'border-b border-current/50'
          )}
        />
      ))}
    </span>
  )
}

function PictureTiles<K extends 'headerLayout' | 'tableLines'>({
  label,
  choice,
  value,
  onChange,
}: {
  label: string
  choice: K
  value: (typeof LAYOUT_CHOICES)[K][number]['value']
  onChange: (v: (typeof LAYOUT_CHOICES)[K][number]['value']) => void
}) {
  const options = LAYOUT_CHOICES[choice] as readonly { value: string; label: string }[]
  const first = options[0].value
  const names: Record<string, string> =
    choice === 'headerLayout'
      ? { template: 'Default', split: 'Classic', reversed: 'Reversed', centered: 'Centred' }
      : { template: 'Default', grid: 'Full grid', rows: 'Row lines', none: 'No lines' }
  return (
    <div className='space-y-1.5'>
      <FieldLabel label={label} changed={value !== first} onReset={() => onChange(first as typeof value)} />
      <div role='radiogroup' aria-label={label} className='grid grid-cols-4 gap-2'>
        {options.map((o) => {
          const active = o.value === value
          return (
            <button
              key={o.value}
              type='button'
              role='radio'
              aria-checked={active}
              title={o.label}
              onClick={() => onChange(o.value as typeof value)}
              className={cn(
                'group flex min-w-0 flex-col items-center gap-1.5 rounded-lg border p-1.5 text-[11px] font-medium transition-all',
                active ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary' : 'text-muted-foreground hover:border-foreground/30 hover:text-foreground'
              )}
            >
              <span className='flex h-11 w-full items-center justify-center rounded-md border border-dashed border-current/25 bg-background px-2'>
                {choice === 'headerLayout' ? <HeaderSketch kind={o.value} /> : <LinesSketch kind={o.value} />}
              </span>
              <span className='w-full truncate text-center'>{names[o.value]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** One stylesheet with every Google font in the list, so the picker can show each in its own face. */
const FONT_PREVIEW_HREF = `https://fonts.googleapis.com/css2?${FONT_OPTIONS.filter((f) => f.google).map((f) => `family=${f.google}`).join('&')}&display=swap`
function useFontPreviewStylesheet(enabled: boolean) {
  useEffect(() => {
    if (!enabled || document.querySelector('link[data-invoice-font-preview]')) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = FONT_PREVIEW_HREF
    link.dataset.invoiceFontPreview = 'true'
    document.head.appendChild(link)
  }, [enabled])
}

function SizeRow({ label, value, min, max, onChange }: { label: string; value: number | null | undefined; min: number; max: number; onChange: (v: number | null) => void }) {
  const isSet = value != null
  const shown = value ?? Math.round((min + max) / 2.4)
  return (
    <div className='space-y-1'>
      <div className='flex items-center justify-between gap-2 text-sm'>
        <span className={cn(isSet && 'font-medium text-primary')}>{label}</span>
        <span className='flex items-center gap-1'>
          <input
            type='number'
            min={min}
            max={max}
            value={isSet ? value : ''}
            placeholder='Auto'
            onChange={(e) => {
              const n = Number(e.target.value)
              onChange(e.target.value === '' || !Number.isFinite(n) ? null : Math.min(max, Math.max(min, Math.round(n))))
            }}
            aria-label={`${label} size in pixels`}
            className='h-7 w-16 rounded-md border border-input bg-transparent px-1.5 text-end text-xs tabular-nums outline-none focus-visible:border-input-ring dark:bg-input/30'
          />
          <span className='w-4 text-[11px] text-muted-foreground'>px</span>
          <button
            type='button'
            onClick={() => onChange(null)}
            disabled={!isSet}
            className='rounded p-0.5 text-muted-foreground hover:text-foreground disabled:invisible'
            title='Back to the template size'
            aria-label={`Reset ${label}`}
          >
            <RotateCcw className='size-3.5' />
          </button>
        </span>
      </div>
      <input
        type='range'
        min={min}
        max={max}
        value={shown}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className={cn('w-full accent-[var(--primary)]', !isSet && 'opacity-40')}
      />
    </div>
  )
}

/* ── Preview ─────────────────────────────────────────────────────────────── */

function Preview({ html, sheet }: { html: string; sheet: SheetKind }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.6)
  const page = PAGE[sheet]
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const fit = () => {
      const pad = 32
      setScale(Math.min((el.clientWidth - pad) / page.w, (el.clientHeight - pad) / page.h, 1.2))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [page.w, page.h])
  return (
    <div ref={boxRef} className='flex h-full min-h-0 items-start justify-center overflow-auto bg-muted/60 p-4'>
      <div className='shrink-0 overflow-hidden rounded-sm bg-white shadow-xl ring-1 ring-black/10' style={{ width: page.w * scale, height: page.h * scale }}>
        <iframe
          title='Invoice preview'
          srcDoc={html}
          tabIndex={-1}
          style={{ width: page.w, height: page.h, border: 'none', background: '#fff', transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}
        />
      </div>
    </div>
  )
}

/* ── The designer ────────────────────────────────────────────────────────── */

const TABS = [
  { key: 'text', label: 'Text & sizes', icon: Type },
  { key: 'layout', label: 'Layout', icon: LayoutTemplate },
  { key: 'show', label: 'Show / hide', icon: Eye },
  { key: 'wording', label: 'Wording', icon: PenLine },
  { key: 'colours', label: 'Colours', icon: Palette },
] as const
type TabKey = (typeof TABS)[number]['key']

const COLOR_FIELDS: { key: keyof PrintColors; label: string; placeholder: string }[] = [
  { key: 'pageBg', label: 'Page background', placeholder: '#ffffff' },
  { key: 'headerBg', label: 'Header background', placeholder: '#ffffff' },
  { key: 'headerText', label: 'Header text', placeholder: '#000000' },
  { key: 'accent', label: 'Accent (lines, totals)', placeholder: '#000000' },
  { key: 'tableHeaderBg', label: 'Table heading background', placeholder: '#ffffff' },
  { key: 'tableHeaderText', label: 'Table heading text', placeholder: '#000000' },
  { key: 'footerBg', label: 'Footer background', placeholder: '#ffffff' },
  { key: 'footerText', label: 'Footer text', placeholder: '#666666' },
]
const sameColors = (a: PrintColors, b: PrintColors) => PRINT_COLOR_KEYS.every((k) => (a[k] ?? null) === (b[k] ?? null))

export interface DesignerValue {
  template: InvoiceTemplate
  colors: PrintColors
  design: PrintDesign
}

interface InvoiceDesignerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: DesignerValue
  saving: boolean
  onSave: (value: DesignerValue) => Promise<boolean>
}

/**
 * Full-screen invoice designer: every control on the left, the real print (same generator
 * as printing) on the right, updating as you change things. Sizes are edited for the sheet
 * shown in the preview, so A4 and A5 can each be tuned.
 */
export function InvoiceDesigner({ open, onOpenChange, initial, saving, onSave }: InvoiceDesignerProps) {
  const currencyMeta = useCurrencyMeta()
  const [draft, setDraft] = useState<DesignerValue>(initial)
  const [sheet, setSheet] = useState<SheetKind>('a4')
  const [tab, setTab] = useState<TabKey>('text')
  useFontPreviewStylesheet(open)
  // Below 1024px there is room for one pane at a time.
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit')

  useEffect(() => {
    if (open) setDraft(initial)
    // Only when (re)opened — not on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const html = useMemo(
    () =>
      previewOnly(
        withPrintColors(draft.colors, () =>
          withPrintDesign(draft.design, () => generateA4InvoiceHTML({ ...SAMPLE, currencyMeta }, sheet, draft.template))
        )
      ),
    [draft, sheet, currencyMeta]
  )

  const setDesign = (patch: Partial<PrintDesign>) => setDraft((d) => ({ ...d, design: { ...d.design, ...patch } }))
  const setSize = (key: SizeKey, value: number | null) =>
    setDraft((d) => ({ ...d, design: { ...d.design, sizes: { ...d.design.sizes, [sheet]: { ...d.design.sizes[sheet], [key]: value } } } }))
  const copySizesFromOtherSheet = () => {
    const other = sheet === 'a4' ? 'a5' : 'a4'
    const ratio = sheet === 'a5' ? 0.72 : 1 / 0.72
    const scaled = Object.fromEntries(
      SIZE_FIELDS.map((f) => {
        const v = draft.design.sizes[other][f.key]
        return [f.key, v == null ? null : Math.min(f.max, Math.max(f.min, Math.round(v * ratio)))]
      })
    )
    setDraft((d) => ({ ...d, design: { ...d.design, sizes: { ...d.design.sizes, [sheet]: scaled } } }))
  }
  const otherHasSizes = Object.values(draft.design.sizes[sheet === 'a4' ? 'a5' : 'a4']).some((v) => v != null)

  const save = async () => {
    if (await onSave(draft)) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Kept clear of the fixed notification / install banners at the bottom of the screen. */}
      <DialogContent className='top-[calc(50%-(var(--push-banner-height,0px)+var(--pwa-banner-height,0px))/2)] flex h-[calc(100dvh-var(--push-banner-height,0px)-var(--pwa-banner-height,0px)-2rem)] max-h-[960px] w-[97vw] max-w-[1500px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1500px]'>
        {/* Top bar */}
        <div className='flex flex-wrap items-center gap-3 border-b px-4 py-3 pe-12'>
          <div className='me-auto min-w-0'>
            <DialogTitle className='text-base'>Invoice designer</DialogTitle>
            <DialogDescription className='text-xs'>A4 &amp; A5 sales invoices and purchase bills. Anything left on default keeps the template's look.</DialogDescription>
          </div>
          <div className='flex items-center gap-2 text-sm'>
            <span className='text-muted-foreground'>Template</span>
            <Select value={draft.template} onValueChange={(v) => setDraft((d) => ({ ...d, template: v as InvoiceTemplate }))}>
              <SelectTrigger size='sm' className='w-44' aria-label='Template'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVOICE_TEMPLATE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div role='radiogroup' aria-label='Edit or preview' className='flex rounded-lg bg-muted p-0.5 lg:hidden'>
            {(['edit', 'preview'] as const).map((v) => (
              <button
                key={v}
                type='button'
                role='radio'
                aria-checked={mobileView === v}
                onClick={() => setMobileView(v)}
                className={cn('rounded-md px-3 py-1 text-xs font-semibold capitalize', mobileView === v ? 'bg-background shadow-sm' : 'text-muted-foreground')}
              >
                {v}
              </button>
            ))}
          </div>
          <div role='radiogroup' aria-label='Sheet size' className='flex rounded-lg bg-muted p-0.5'>
            {(['a4', 'a5'] as const).map((s) => (
              <button
                key={s}
                type='button'
                role='radio'
                aria-checked={sheet === s}
                onClick={() => setSheet(s)}
                className={cn('rounded-md px-3 py-1 text-xs font-semibold', sheet === s ? 'bg-background shadow-sm' : 'text-muted-foreground')}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className='grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)]'>
          {/* Controls */}
          <div className={cn('min-h-0 flex-col border-e', mobileView === 'edit' ? 'flex' : 'hidden lg:flex')}>
            {/* All five tabs always visible: equal columns, icon above the label — no sideways scrolling. */}
            <div role='tablist' className='grid shrink-0 grid-cols-5 gap-1 border-b p-2'>
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type='button'
                  role='tab'
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={cn(
                    'flex min-w-0 flex-col items-center gap-1 rounded-md px-1 py-1.5 text-center text-[11px] font-medium leading-tight',
                    tab === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <Icon className='size-4 shrink-0' />
                  <span className='w-full'>{label}</span>
                </button>
              ))}
            </div>

            <div className='min-h-0 flex-1 space-y-6 overflow-y-auto p-4'>
              {tab === 'text' && (
                <>
                  <Group title='Typography'>
                    <div className='space-y-1.5'>
                      <FieldLabel label='Font' changed={draft.design.font !== 'template'} onReset={() => setDesign({ font: 'template' })} />
                      <Select value={draft.design.font} onValueChange={(v) => setDesign({ font: v as PrintDesign['font'] })}>
                        <SelectTrigger className='w-full' aria-label='Font'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className='max-h-80'>
                          {FONT_OPTIONS.map((f) => (
                            <SelectItem key={f.key} value={f.key}>
                              <span style={f.stack ? { fontFamily: f.stack } : undefined}>{f.label}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Segmented label='Business name' choice='nameCase' value={draft.design.nameCase} onChange={(v) => setDesign({ nameCase: v })} />
                    <Segmented label='Item rows' choice='rowWeight' value={draft.design.rowWeight} onChange={(v) => setDesign({ rowWeight: v })} />
                  </Group>
                  <Group title={`Text sizes — ${sheet.toUpperCase()}`} hint={`These sizes apply to ${sheet.toUpperCase()} sheets; switch A4/A5 at the top to tune the other.`}>
                    {otherHasSizes && (
                      <Button size='sm' variant='outline' className='w-full' onClick={copySizesFromOtherSheet}>
                        Copy {sheet === 'a4' ? 'A5' : 'A4'} sizes here (scaled)
                      </Button>
                    )}
                    <div className='space-y-3'>
                      {SIZE_FIELDS.map((f) => (
                        <SizeRow key={f.key} label={f.label} min={f.min} max={f.max} value={draft.design.sizes[sheet][f.key]} onChange={(v) => setSize(f.key, v)} />
                      ))}
                    </div>
                  </Group>
                </>
              )}

              {tab === 'layout' && (
                <>
                  <Group title='Header'>
                    <PictureTiles label='Arrangement' choice='headerLayout' value={draft.design.headerLayout} onChange={(v) => setDesign({ headerLayout: v })} />
                    <SizeRow label='Logo width' min={40} max={320} value={draft.design.logoSize} onChange={(v) => setDesign({ logoSize: v })} />
                  </Group>
                  <Group title='Page'>
                    <Segmented label='Margins' choice='margins' value={draft.design.margins} onChange={(v) => setDesign({ margins: v })} />
                    <Segmented label='Corners' choice='corners' value={draft.design.corners} onChange={(v) => setDesign({ corners: v })} />
                  </Group>
                  <Group title='Items table'>
                    <PictureTiles label='Lines' choice='tableLines' value={draft.design.tableLines} onChange={(v) => setDesign({ tableLines: v })} />
                    <Segmented label='Row spacing' choice='rowDensity' value={draft.design.rowDensity} onChange={(v) => setDesign({ rowDensity: v })} />
                    <Segmented label='Row colours' choice='zebra' value={draft.design.zebra} onChange={(v) => setDesign({ zebra: v })} />
                  </Group>
                  <Group title='Totals & signatures'>
                    <Segmented label='Totals box width' choice='totalsWidth' value={draft.design.totalsWidth} onChange={(v) => setDesign({ totalsWidth: v })} />
                    <Segmented label='Signature strip' choice='signatures' value={draft.design.signatures} onChange={(v) => setDesign({ signatures: v })} />
                  </Group>
                </>
              )}

              {tab === 'show' && (
                <Group title='Sections on the invoice' hint='Switch off anything you do not want printed.'>
                  <div className='divide-y rounded-lg border'>
                    {SHOW_FIELDS.map((f) => (
                      <label key={f.key} className='flex items-center justify-between gap-3 px-3 py-2 text-sm'>
                        <span>{f.label}</span>
                        <Switch
                          checked={draft.design.show[f.key] !== false}
                          onCheckedChange={(on) => setDesign({ show: { ...draft.design.show, [f.key]: on ? undefined : false } })}
                        />
                      </label>
                    ))}
                  </div>
                </Group>
              )}

              {tab === 'wording' && (
                <Group title='Your own wording (sales invoices)' hint='Leave a box empty to keep the normal text, which also switches to the native language (Urdu, Arabic, …) on native-language prints.'>
                  {(
                    [
                      { key: 'title', label: 'Document title', placeholder: 'Invoice — e.g. Tax Invoice, Sales Invoice, Bill', max: 60 },
                      { key: 'thankYou', label: 'Thank-you line', placeholder: 'Thank you!', max: 160 },
                      { key: 'footerLine', label: 'Footer line', placeholder: 'Please keep this invoice for your records', max: 240 },
                    ] as const
                  ).map((f) => (
                    <label key={f.key} className='block space-y-1 text-sm'>
                      <span>{f.label}</span>
                      <input
                        value={draft.design.texts[f.key]}
                        maxLength={f.max}
                        placeholder={f.placeholder}
                        onChange={(e) => setDesign({ texts: { ...draft.design.texts, [f.key]: e.target.value } })}
                        className='h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-input-ring focus-visible:ring-[3px] focus-visible:ring-input-ring/50 dark:bg-input/30'
                      />
                    </label>
                  ))}
                  <p className='text-xs text-muted-foreground'>Notes and terms &amp; conditions are typed on each invoice (default terms live in Branch Management, next to the branch invoice note).</p>
                </Group>
              )}

              {tab === 'colours' && (
                <>
                  <Group title='Ready-made colours'>
                    <div className='flex flex-wrap gap-2'>
                      {PRINT_COLOR_PRESETS.map((preset) => {
                        const selected = sameColors(draft.colors, preset.colors)
                        return (
                          <button
                            key={preset.key}
                            type='button'
                            onClick={() => setDraft((d) => ({ ...d, colors: preset.colors }))}
                            aria-pressed={selected}
                            className={cn('flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium', selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50')}
                          >
                            <span className='flex overflow-hidden rounded-full border'>
                              {[preset.colors.headerBg ?? '#ffffff', preset.colors.tableHeaderBg ?? '#f1f5f9', preset.colors.footerBg ?? '#ffffff'].map((c, i) => (
                                <span key={i} className='block h-4 w-2.5' style={{ background: c }} />
                              ))}
                            </span>
                            {preset.label}
                          </button>
                        )
                      })}
                    </div>
                  </Group>
                  <Group title='Any colour'>
                    <div className='space-y-2'>
                      {COLOR_FIELDS.map((f) => (
                        <ColorField
                          key={f.key}
                          label={f.label}
                          value={draft.colors[f.key]}
                          placeholderColor={f.placeholder}
                          onChange={(value) => setDraft((d) => ({ ...d, colors: { ...d.colors, [f.key]: value } }))}
                        />
                      ))}
                    </div>
                  </Group>
                </>
              )}
            </div>
          </div>

          {/* Live preview */}
          <div className={cn('min-h-0', mobileView === 'preview' ? 'block' : 'hidden lg:block')}>
            <Preview html={html} sheet={sheet} />
          </div>
        </div>

        {/* Bottom bar */}
        <div className='flex flex-wrap items-center gap-2 border-t px-4 py-3'>
          <Button variant='ghost' size='sm' onClick={() => setDraft((d) => ({ ...d, colors: {}, design: EMPTY_DESIGN }))}>
            <RotateCcw className='mr-1.5 size-4' /> Reset design to template
          </Button>
          <span className='me-auto' />
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className='mr-2 size-4 animate-spin' />}
            Save design
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
