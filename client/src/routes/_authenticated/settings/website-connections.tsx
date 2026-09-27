import { createFileRoute } from '@tanstack/react-router'
import WebsiteConnectionsSettings from '@/features/settings/website-connections'

export const Route = createFileRoute('/_authenticated/settings/website-connections')({
  component: WebsiteConnectionsSettings,
})
