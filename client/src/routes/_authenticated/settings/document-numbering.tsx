import { createFileRoute } from '@tanstack/react-router'
import DocumentNumberingSettings from '@/features/settings/document-numbering/document-numbering-settings'

export const Route = createFileRoute('/_authenticated/settings/document-numbering')({
  component: DocumentNumberingSettings,
})
