import { createFileRoute } from '@tanstack/react-router';
import IdCardPage from '@/features/school/id-cards/id-cards-page';

export const Route = createFileRoute('/_authenticated/school/id-cards/')({
  component: IdCardPage,
});
