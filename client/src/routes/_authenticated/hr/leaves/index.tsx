import { createFileRoute } from '@tanstack/react-router';
import LeaveManagement from '@/features/hr/leaves/leave-management';

export const Route = createFileRoute('/_authenticated/hr/leaves/')({
  component: LeaveManagement,
});
