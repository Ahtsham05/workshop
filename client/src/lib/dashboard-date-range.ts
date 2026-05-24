import { format } from 'date-fns'

import { getBusinessToday, shiftBusinessCalendarDate } from '@/lib/business-timezone'

export type DashboardDatePreset = 'today' | 'week' | 'month' | 'custom'

export type DashboardDateRange = {
  period: DashboardDatePreset
  startDate: string
  endDate: string
}

const CALENDAR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function parseCalendarParts(calendarDate: string) {
  const match = CALENDAR_DATE_RE.exec(calendarDate)
  if (!match) return null
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
  }
}

function formatCalendarDate(date: Date): string {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function getBusinessWeekStart(today = getBusinessToday()): string {
  const parts = parseCalendarParts(today)
  if (!parts) return today
  const d = new Date(parts.year, parts.month, parts.day)
  const dow = d.getDay()
  const diff = dow === 0 ? 6 : dow - 1
  d.setDate(d.getDate() - diff)
  return formatCalendarDate(d)
}

export function getBusinessMonthStart(today = getBusinessToday()): string {
  const parts = parseCalendarParts(today)
  if (!parts) return today
  return `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-01`
}

export function buildDashboardDateRange(preset: DashboardDatePreset, custom?: Partial<DashboardDateRange>): DashboardDateRange {
  const today = getBusinessToday()

  if (preset === 'custom') {
    const startDate = custom?.startDate || today
    const endDate = custom?.endDate || startDate
    return {
      period: 'custom',
      startDate: startDate <= endDate ? startDate : endDate,
      endDate: startDate <= endDate ? endDate : startDate,
    }
  }

  if (preset === 'week') {
    return {
      period: 'week',
      startDate: shiftBusinessCalendarDate(today, -6),
      endDate: today,
    }
  }

  if (preset === 'month') {
    return { period: 'month', startDate: getBusinessMonthStart(today), endDate: today }
  }

  return { period: 'today', startDate: today, endDate: today }
}

export function getDefaultDashboardDateRange(): DashboardDateRange {
  return buildDashboardDateRange('today')
}

export function formatDashboardRangeLabel(range: DashboardDateRange, t: (key: string) => string): string {
  if (range.period === 'today') return t('Today')
  if (range.period === 'week') return t('This Week')
  if (range.period === 'month') return t('This Month')
  if (range.startDate === range.endDate) return range.startDate
  return `${range.startDate} – ${range.endDate}`
}

function parseRangeDate(dateStr: string): Date {
  const parts = parseCalendarParts(dateStr)
  if (!parts) return new Date()
  return new Date(parts.year, parts.month, parts.day)
}

export function formatDashboardRangeSubtitle(range: DashboardDateRange): string {
  const start = parseRangeDate(range.startDate)
  const end = parseRangeDate(range.endDate)

  if (range.startDate === range.endDate) {
    return format(start, 'MMM d, yyyy')
  }

  const sameYear = start.getFullYear() === end.getFullYear()
  const sameMonth = sameYear && start.getMonth() === end.getMonth()

  if (sameMonth) {
    return `${format(start, 'MMM d')} – ${format(end, 'd, yyyy')}`
  }

  if (sameYear) {
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
  }

  return `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`
}

export function dashboardRangeQueryParams(range: DashboardDateRange) {
  return {
    period: range.period,
    startDate: range.startDate,
    endDate: range.endDate,
  }
}

export function getComparisonLabel(period: DashboardDatePreset, t: (key: string) => string): string {
  switch (period) {
    case 'today':
      return t('from yesterday')
    case 'week':
      return t('from last week')
    case 'month':
      return t('from last month')
    default:
      return t('from previous period')
  }
}

/** Quick presets for custom range shortcuts (last 7 days, etc.) */
export function lastNDaysRange(days: number): DashboardDateRange {
  const endDate = getBusinessToday()
  return {
    period: 'custom',
    startDate: shiftBusinessCalendarDate(endDate, -(days - 1)),
    endDate,
  }
}
