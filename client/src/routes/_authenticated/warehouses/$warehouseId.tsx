import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import WarehouseDetail from '@/features/warehouses/warehouse-detail'

const searchSchema = z.object({
  tab: z.enum(['stock', 'locations', 'rules', 'transfers', 'moves']).optional(),
})

export const Route = createFileRoute('/_authenticated/warehouses/$warehouseId')({
  component: WarehouseDetail,
  validateSearch: searchSchema,
})
