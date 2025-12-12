import { createFileRoute } from '@tanstack/react-router'
import UsersManagementPage from '@/features/users-management'

export const Route = createFileRoute('/_authenticated/users-management/')({
  component: UsersManagementPage,
})
