import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAppearance } from '@/context/appearance-context'
import { ROW_SCHEMES, type RowColors, type RowScheme } from '@/lib/appearance'

/** Three stacked stripes painted with a scheme's own colours, over the page surface. */
function SchemeSwatch({ colors, className }: { colors: RowColors; className?: string }) {
  return (
    <div className={cn('bg-background overflow-hidden rounded-md border', className)}>
      <div className='h-3' style={{ backgroundColor: colors.head }} />
      <div className='h-3.5' style={{ backgroundColor: colors.base }} />
      <div className='h-3.5' style={{ backgroundColor: colors.alt }} />
      <div className='h-3.5' style={{ backgroundColor: colors.base }} />
      <div className='h-3.5' style={{ backgroundColor: colors.hover }} />
    </div>
  )
}

function SchemeCard({
  scheme,
  selected,
  onSelect,
}: {
  scheme: RowScheme
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type='button'
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'group rounded-lg border p-2 text-left transition-colors',
        selected ? 'border-primary ring-primary/30 ring-2' : 'hover:border-muted-foreground/40'
      )}
    >
      {/* One swatch per theme: the scheme looks different by day and by night, and
          whichever one is live is the one shown. */}
      <SchemeSwatch colors={scheme.light} className='dark:hidden' />
      <SchemeSwatch colors={scheme.dark} className='hidden dark:block' />
      <div className='mt-2 flex items-center gap-1'>
        <span className='truncate text-xs font-medium'>{scheme.label}</span>
        {selected && <Check className='text-primary ml-auto h-3.5 w-3.5 shrink-0' />}
      </div>
    </button>
  )
}

/** Sample data — realistic enough to judge readability, short enough to scan. */
const PREVIEW_ROWS = [
  { invoice: 'INV-1043', customer: 'Ali Traders', amount: '24,500' },
  { invoice: 'INV-1044', customer: 'Hassan Mobiles', amount: '8,900' },
  { invoice: 'INV-1045', customer: 'Noor Electronics', amount: '132,000' },
  { invoice: 'INV-1046', customer: 'City Wholesale', amount: '17,250' },
]

/**
 * Table row colours. Every table in the app reads the same CSS variables, so a
 * choice here lands everywhere at once — including the live preview below it.
 */
export function RowColorsSection() {
  const { preferences, setPreferences } = useAppearance()
  const activeScheme = ROW_SCHEMES.find((s) => s.key === preferences.rowScheme)

  return (
    <section className='space-y-4'>
      <div>
        <h4 className='text-sm font-medium'>Table row colours</h4>
        <p className='text-muted-foreground text-sm'>
          Applies to every list and report in the app. Pick the combination your eyes
          find easiest over a long day.
        </p>
      </div>

      <div className='grid grid-cols-3 gap-3 sm:grid-cols-4'>
        {ROW_SCHEMES.map((scheme) => (
          <SchemeCard
            key={scheme.key}
            scheme={scheme}
            selected={preferences.rowScheme === scheme.key}
            onSelect={() => setPreferences({ rowScheme: scheme.key })}
          />
        ))}
      </div>

      {activeScheme && (
        <p className='text-muted-foreground text-xs'>{activeScheme.description}</p>
      )}

      <div className='flex items-center justify-between rounded-lg border p-4'>
        <div className='space-y-0.5 pr-4'>
          <Label htmlFor='alternate-rows'>Alternating row colour</Label>
          <p className='text-muted-foreground text-sm'>
            Shades every second row so your eye does not lose its place across wide
            tables.
          </p>
        </div>
        <Switch
          id='alternate-rows'
          checked={preferences.alternateRows}
          onCheckedChange={(checked) => setPreferences({ alternateRows: checked })}
        />
      </div>

      <div className='space-y-2'>
        <Label>Preview</Label>
        <div className='overflow-hidden rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className='text-right'>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PREVIEW_ROWS.map((row) => (
                <TableRow key={row.invoice}>
                  <TableCell className='font-medium'>{row.invoice}</TableCell>
                  <TableCell>{row.customer}</TableCell>
                  <TableCell className='text-right tabular-nums'>{row.amount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className='text-muted-foreground text-xs'>
          Hover a row to see the highlight colour.
        </p>
      </div>
    </section>
  )
}
