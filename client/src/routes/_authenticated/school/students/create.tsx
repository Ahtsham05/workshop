import { createFileRoute } from '@tanstack/react-router';
import StudentForm from '@/features/school/students/student-form';

export const Route = createFileRoute('/_authenticated/school/students/create')({
  validateSearch: (s: Record<string, unknown>) => ({ prefill: (s.prefill ?? '') as string }),
  component: () => {
    const { prefill } = Route.useSearch();
    let parsed: any = undefined;
    if (prefill) {
      try { parsed = JSON.parse(prefill); } catch { /* ignore */ }
    }
    return <StudentForm visitorPrefill={parsed} />;
  },
});
