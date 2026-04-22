import { createFileRoute } from '@tanstack/react-router';
import ParentPortalPage from '@/features/school/portals/parent-portal-page';

export const Route = createFileRoute('/_authenticated/school/portals/parent')({
  component: ParentPortalPage,
});
