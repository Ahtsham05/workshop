import { createFileRoute } from '@tanstack/react-router';
import DepartmentManagement from '@/features/hr/departments/department-management';

export const Route = createFileRoute('/_authenticated/hr/departments/')({
  component: DepartmentManagement,
});
