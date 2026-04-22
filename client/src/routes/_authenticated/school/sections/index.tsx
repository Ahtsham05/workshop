import { createFileRoute } from '@tanstack/react-router';
import SectionManagement from '@/features/school/sections/section-management';

export const Route = createFileRoute('/_authenticated/school/sections/')({
  component: SectionManagement,
});
