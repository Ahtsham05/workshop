import { createFileRoute } from '@tanstack/react-router'
import WarehousesSettings from '@/features/settings/warehouses/warehouses-settings'

export const Route = createFileRoute('/_authenticated/settings/warehouses')({
  component: WarehousesSettings,
})
