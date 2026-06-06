import { createFileRoute } from '@tanstack/react-router';
import NotificationsManagement from '@/features/school/notifications/notifications-management';

export const Route = createFileRoute('/_authenticated/school/notifications/')({
  component: NotificationsManagement,
});
