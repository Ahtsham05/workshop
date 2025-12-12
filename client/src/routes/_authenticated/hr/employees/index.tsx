import { createFileRoute } from '@tanstack/react-router';
import EmployeeList from '@/features/hr/employees/employee-list';

export const Route = createFileRoute('/_authenticated/hr/employees/')({
  component: EmployeeList,
});
