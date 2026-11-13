import { contactAddressText } from '@/lib/countries'
/** Invoices and customers come from the API untyped (see invoice.api / customer lists) —
 *  one named alias here instead of scattering bare `any` through the phone screens. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiRecord = Record<string, any>

export function formatCustomerAddress(customer: ApiRecord | undefined | null): string {
  if (!customer) return ''
  // "Street, City, ST ZIP, Country" (lib/countries.ts).
  return contactAddressText(customer)
}

/** Odoo-style coloured initial tile for people/companies without a photo. */
const TILE_COLORS = [
  'bg-emerald-600',
  'bg-sky-600',
  'bg-violet-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-teal-600',
  'bg-indigo-600',
  'bg-orange-600',
  'bg-lime-700',
  'bg-fuchsia-600',
]

export function initialTileColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return TILE_COLORS[Math.abs(hash) % TILE_COLORS.length]
}
