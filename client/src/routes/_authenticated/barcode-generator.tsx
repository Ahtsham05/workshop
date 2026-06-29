import { createFileRoute } from '@tanstack/react-router'
import BarcodeGenerator from '@/features/barcode-generator'

export const Route = createFileRoute('/_authenticated/barcode-generator')({
  component: BarcodeGenerator,
})
