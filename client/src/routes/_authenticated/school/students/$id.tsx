import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/school/students/$id')({
  component: StudentIdLayout,
});

function StudentIdLayout() {
  return <Outlet />;
}
