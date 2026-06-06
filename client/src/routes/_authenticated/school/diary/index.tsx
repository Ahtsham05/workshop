import { createFileRoute } from '@tanstack/react-router';
import DiaryManagement from '@/features/school/diary/diary-management';

export const Route = createFileRoute('/_authenticated/school/diary/')({
  component: DiaryManagement,
});
