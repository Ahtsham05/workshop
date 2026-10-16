import { Fragment } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatAppDate, formatAppDateTime } from '@/lib/date-format'
import { useLanguage } from '@/context/language-context'
import {
  cellOf,
  keyToDate,
  type DocColumn,
  type DocRow,
  type DocSection,
  type ReportDrill,
  type ReportDoc,
} from '../lib/report-doc'

/*
 * On-screen rendering of a report document: a statement "sheet" — heading block, boxed
 * summary strip, ruled registers. Tables scroll sideways inside the sheet on narrow
 * screens rather than squeezing figures.
 */

const TONE: Record<string, string> = {
  danger: 'text-rose-600 dark:text-rose-400',
  success: 'text-emerald-700 dark:text-emerald-400',
  muted: 'text-muted-foreground italic',
}

function GroupBands({ columns }: { columns: DocColumn[] }) {
  if (!columns.some((c) => c.group)) return null
  const cells: React.ReactNode[] = []
  for (let i = 0; i < columns.length; ) {
    const g = columns[i].group
    let n = 1
    while (g && i + n < columns.length && columns[i + n].group === g) n += 1
    cells.push(
      <th
        key={i}
        colSpan={n}
        className={cn(
          'px-2 pt-2 pb-1 text-center text-[11px] font-semibold tracking-wider uppercase',
          g ? 'border-border border-x border-t' : 'border-0'
        )}
      >
        {g}
      </th>
    )
    i += n
  }
  return <tr>{cells}</tr>
}

function Cell({ column, value }: { column: DocColumn; value: DocRow['cells'][string] }) {
  const c = cellOf(value)
  return (
    <td
      className={cn(
        'border-border border px-2 py-1.5 align-top',
        column.align === 'right' && 'text-right whitespace-nowrap tabular-nums',
        column.align === 'center' && 'text-center',
        column.nowrap && 'whitespace-nowrap',
        c.strong && 'font-semibold',
        c.tone && TONE[c.tone]
      )}
    >
      {c.text}
      {c.sub && (
        <div className='text-muted-foreground mt-0.5 text-[11px] font-normal not-italic'>
          {c.sub}
        </div>
      )}
    </td>
  )
}

function Row({
  row,
  columns,
  onDrill,
}: {
  row: DocRow
  columns: DocColumn[]
  onDrill?: (drill: ReportDrill) => void
}) {
  const navigate = useNavigate()
  const kind = row.kind || 'line'
  const open = row.drill
    ? () => onDrill?.(row.drill!)
    : row.link
      ? () => navigate({ to: row.link as never })
      : undefined
  const span = row.label != null ? Math.min(row.labelSpan ?? columns.length, columns.length) : 0
  return (
    <tr
      onClick={open}
      onKeyDown={
        open
          ? (e) => {
              if (e.key === 'Enter') open()
            }
          : undefined
      }
      tabIndex={open ? 0 : undefined}
      className={cn(
        open &&
          'hover:bg-muted/50 focus-visible:bg-muted/60 cursor-pointer outline-none',
        kind === 'group' && 'bg-muted/50',
        (kind === 'total' || kind === 'closing' || kind === 'opening') &&
          'bg-muted/30 [&>td]:border-t-foreground/60 font-semibold [&>td]:border-t-2',
        row.groupStart && '[&>td]:border-t-foreground/40'
      )}
    >
      {row.label != null && (
        <td
          colSpan={span}
          className={cn(
            'border-border border px-2 py-1.5',
            kind === 'group' ? 'font-semibold' : 'font-semibold'
          )}
        >
          <span className='inline-flex items-center gap-1'>
            {row.label}
            {open && kind === 'group' && (
              <ChevronRight className='text-muted-foreground h-3.5 w-3.5' aria-hidden />
            )}
          </span>
          {row.labelSub && (
            <span className='text-muted-foreground ml-3 text-xs font-normal'>
              {row.labelSub}
            </span>
          )}
        </td>
      )}
      {columns.slice(span).map((col) => (
        <Cell key={col.key} column={col} value={row.cells[col.key]} />
      ))}
    </tr>
  )
}

function Section({
  section,
  wide,
  onDrill,
}: {
  section: DocSection
  wide: boolean
  onDrill?: (drill: ReportDrill) => void
}) {
  return (
    <section className='space-y-2'>
      {section.title && (
        <h3 className='border-foreground border-l-4 pl-2 text-sm font-semibold tracking-wide uppercase'>
          {section.title}
        </h3>
      )}
      <div className='overflow-x-auto'>
        <table
          className={cn(
            'w-full border-collapse text-[13px]',
            wide ? 'min-w-[1120px]' : 'min-w-[640px]'
          )}
        >
          <thead>
            <GroupBands columns={section.columns} />
            <tr>
              {section.columns.map((c) => (
                <th
                  key={c.key}
                  scope='col'
                  className={cn(
                    'border-border border border-b-foreground/60 bg-muted/40 border-b-2 px-2 py-2 align-bottom text-[11px] font-semibold tracking-wide uppercase',
                    c.align === 'right' ? 'text-right' : 'text-left'
                  )}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.rows.length ? (
              section.rows.map((row, i) => (
                <Row key={i} row={row} columns={section.columns} onDrill={onDrill} />
              ))
            ) : (
              <tr>
                <td
                  colSpan={section.columns.length}
                  className='border-border text-muted-foreground border px-3 py-8 text-center italic'
                >
                  {section.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {section.note && (
        <p className='text-muted-foreground text-xs'>{section.note}</p>
      )}
    </section>
  )
}

export function ReportView({
  doc,
  companyName,
  branchName,
  onDrill,
}: {
  doc: ReportDoc
  companyName?: string
  branchName?: string
  onDrill?: (drill: ReportDrill) => void
}) {
  const { t } = useLanguage()
  const period = doc.asOf
    ? `${t('As of')} ${formatAppDateTime(new Date(doc.asOf))}`
    : doc.periodStart && doc.periodEnd
      ? `${formatAppDate(keyToDate(doc.periodStart))} — ${formatAppDate(keyToDate(doc.periodEnd))}`
      : ''
  return (
    <article className='bg-card text-card-foreground rounded-xl border shadow-xs'>
      <header className='flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b-4 border-double border-foreground/70 px-5 pt-5 pb-3 max-sm:px-4'>
        <div className='min-w-0'>
          {companyName && (
            <div className='text-lg font-bold tracking-tight'>{companyName}</div>
          )}
          {branchName && (
            <div className='text-muted-foreground text-xs'>{branchName}</div>
          )}
        </div>
        <div className='text-right max-sm:text-left'>
          <div className='text-base font-bold tracking-wider uppercase'>
            {doc.title}
          </div>
          {doc.subtitle && <div className='text-sm font-semibold'>{doc.subtitle}</div>}
          <div className='text-muted-foreground text-xs'>{period}</div>
        </div>
      </header>

      <div className='space-y-5 px-5 py-4 max-sm:px-4'>
        {doc.info && doc.info.length > 0 && (
          <dl className='grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border px-4 py-3 sm:grid-cols-4'>
            {doc.info.map((i) => (
              <div key={i.label} className='min-w-0'>
                <dt className='text-muted-foreground text-[11px] font-medium tracking-wide uppercase'>
                  {i.label}
                </dt>
                <dd className='truncate text-sm font-semibold'>{i.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className='bg-border grid grid-cols-2 gap-px overflow-hidden rounded-lg border lg:grid-cols-4'>
          {doc.summary.map((s) => (
            <div
              key={s.label}
              className={cn(
                'bg-card min-w-0 px-4 py-3',
                s.emphasis && 'bg-muted/40 shadow-[inset_0_0_0_2px_var(--foreground)]'
              )}
            >
              <div className='text-muted-foreground text-xs font-medium'>{s.label}</div>
              <div
                className={cn(
                  'mt-1 truncate font-semibold tracking-tight tabular-nums',
                  s.emphasis ? 'text-xl' : 'text-lg'
                )}
              >
                {s.value}
              </div>
              {s.hint && (
                <div className='text-muted-foreground mt-0.5 truncate text-xs'>{s.hint}</div>
              )}
            </div>
          ))}
        </div>

        {doc.sections.map((s) => (
          <Fragment key={s.id}>
            <Section section={s} wide={doc.orientation === 'landscape'} onDrill={onDrill} />
          </Fragment>
        ))}

        {doc.footnotes?.map((f) => (
          <p key={f} className='text-muted-foreground text-xs'>
            * {f}
          </p>
        ))}
      </div>
    </article>
  )
}
