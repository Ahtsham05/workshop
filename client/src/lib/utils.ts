import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formats a date value, falling back to `placeholder` for missing/unparseable input instead of throwing. */
export function formatDateSafe(value: string | number | Date | null | undefined, dateFormat: string, placeholder = '—'): string {
  if (!value) return placeholder
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? placeholder : format(date, dateFormat)
}
