import { createFileRoute } from '@tanstack/react-router'
import DemoDataSettings from '@/features/settings/demo-data/demo-data-settings'

export const Route = createFileRoute('/_authenticated/settings/demo-data')({
  component: DemoDataSettings,
})
