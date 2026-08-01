import LongText from '@/components/long-text'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { reportEntityName, reportEntityNameClass } from '../utils/report-entity-name'

interface ReportProductNameCellProps {
  nameEn: string | undefined | null
  nameUrdu?: string | undefined | null
  className?: string
  suffix?: React.ReactNode
}

/** Truncates a long product name with an ellipsis and shows the full name in a tooltip/popover on overflow.
 * `suffix` (batch/serial badges, etc.) wraps in its own row below the name instead of
 * sitting inline after it — inline badges have no width limit of their own, so once a
 * row had both a batch-count label and a serial badge, they'd overflow straight into
 * the table's next column instead of wrapping or clipping. */
export function ReportProductNameCell({ nameEn, nameUrdu, className, suffix }: ReportProductNameCellProps) {
  const { language } = useLanguage()
  const label = reportEntityName(language, nameEn, nameUrdu)
  return (
    <div className='min-w-0'>
      <LongText className={cn('max-w-[220px]', reportEntityNameClass(language, label), className)}>{label}</LongText>
      {/* Capped to the same width as the name above — a flex-wrap row with no width of
          its own just renders at its unwrapped natural width inside an auto-layout
          table (the column grows to fit instead of wrapping), which is exactly how
          this overflowed into the next column before. */}
      {suffix && <div className='mt-1 flex max-w-[220px] flex-wrap items-center gap-1'>{suffix}</div>}
    </div>
  )
}
