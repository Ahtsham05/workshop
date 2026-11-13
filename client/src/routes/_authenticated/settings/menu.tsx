import { createFileRoute } from '@tanstack/react-router'
import MenuVisibilitySettings from '@/features/settings/menu-visibility'

export const Route = createFileRoute('/_authenticated/settings/menu')({
  component: MenuVisibilitySettings,
})
