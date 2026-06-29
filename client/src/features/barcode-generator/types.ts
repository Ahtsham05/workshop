export type EntityTab = 'products' | 'invoices' | 'customers'

export interface BarcodeItem {
  id: string
  code: string
  title: string
  subtitle?: string
}
