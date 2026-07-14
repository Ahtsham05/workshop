import { createFileRoute } from '@tanstack/react-router'
import PrintingSettings from '@/features/settings/printing/printing-settings'

export const Route = createFileRoute('/_authenticated/settings/printing')({
  component: PrintingSettings,
})
