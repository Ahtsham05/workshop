import { createFileRoute } from '@tanstack/react-router';
import DesignationManagement from '@/features/hr/designations/designation-management';

export const Route = createFileRoute('/_authenticated/hr/designations/')({
  component: DesignationManagement,
});
