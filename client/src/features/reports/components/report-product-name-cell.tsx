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

/** Truncates a long product name with an ellipsis and shows the full name in a tooltip/popover on overflow. */
export function ReportProductNameCell({ nameEn, nameUrdu, className, suffix }: ReportProductNameCellProps) {
  const { language } = useLanguage()
  const label = reportEntityName(language, nameEn, nameUrdu)
  return (
    <div className='flex min-w-0 items-center'>
      <LongText className={cn('max-w-[220px]', reportEntityNameClass(language, label), className)}>{label}</LongText>
      {suffix}
    </div>
  )
}
