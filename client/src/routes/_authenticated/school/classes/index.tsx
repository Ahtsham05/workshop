import { createFileRoute } from '@tanstack/react-router';
import ClassManagement from '@/features/school/classes/class-management';

export const Route = createFileRoute('/_authenticated/school/classes/')({
  component: ClassManagement,
});
