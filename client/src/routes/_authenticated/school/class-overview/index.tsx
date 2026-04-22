import { createFileRoute } from '@tanstack/react-router';
import ClassOverviewPage from '@/features/school/class-overview/class-overview-page';

export const Route = createFileRoute('/_authenticated/school/class-overview/')({
  component: ClassOverviewPage,
});
