import { createFileRoute } from '@tanstack/react-router'
import RemindersPage from '@/features/reminders'

export const Route = createFileRoute('/_authenticated/reminders/')({
  component: RemindersPage,
})
