import { createFileRoute } from '@tanstack/react-router';
import ResultSheetPage from '@/features/school/reports/result-sheet-page';

export const Route = createFileRoute('/_authenticated/school/reports/result-sheet')({
  component: ResultSheetPage,
});
