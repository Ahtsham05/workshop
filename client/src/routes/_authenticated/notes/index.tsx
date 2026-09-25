import { createFileRoute } from '@tanstack/react-router'
import NotepadPage from '@/features/notepad'

export const Route = createFileRoute('/_authenticated/notes/')({
  component: NotepadPage,
})
