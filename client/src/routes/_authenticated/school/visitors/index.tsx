import { createFileRoute } from '@tanstack/react-router';
import VisitorList from '@/features/school/visitors/visitor-list';

export const Route = createFileRoute('/_authenticated/school/visitors/')({
  component: VisitorList,
});
