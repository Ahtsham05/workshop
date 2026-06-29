import { createFileRoute } from '@tanstack/react-router'
import AiAssistantPage from '@/features/ai-assistant'

export const Route = createFileRoute('/_authenticated/ai-assistant')({
  component: AiAssistantPage,
})
