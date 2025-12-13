import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useLanguage } from '@/context/language-context';
import {
  useCreateEmployeeMutation,
  useGetDepartmentsQuery,
  useGetEmployeesQuery,
} from '@/stores/hr.api';
import EmployeeForm from '@/features/hr/employees/employee-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/hr/employees/create')({
  component: CreateEmployee,
});

function CreateEmployee() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [createEmployee, { isLoading }] = useCreateEmployeeMutation();
  const { data: departmentsData } = useGetDepartmentsQuery({});
  const { data: employeesData } = useGetEmployeesQuery({ limit: 100 });

  // Mock data for designations and shifts (you can create these APIs too)
  const designations = [
    { id: '1', title: 'Software Engineer' },
    { id: '2', title: 'Senior Software Engineer' },
    { id: '3', title: 'Team Lead' },
    { id: '4', title: 'Manager' },
    { id: '5', title: 'HR Executive' },
    { id: '6', title: 'Accountant' },
  ];

  const shifts = [
    { id: '1', name: 'Morning Shift (9 AM - 5 PM)' },
    { id: '2', name: 'Evening Shift (2 PM - 10 PM)' },
    { id: '3', name: 'Night Shift (10 PM - 6 AM)' },
  ];

  const handleSubmit = async (data: any) => {
    try {
      await createEmployee(data).unwrap();
      toast.success(t('Employee created successfully'));
      navigate({ to: '/hr/employees' as any });
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to create employee'));
    }
  };

  const handleCancel = () => {
    navigate({ to: '/hr/employees' as any });
  };

  return (
    <div className="h-full w-full p-4 space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate({ to: '/hr/employees' as any })}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <CardTitle>{t('Add New Employee')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <EmployeeForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isLoading={isLoading}
            departments={departmentsData?.results || []}
            designations={designations}
            shifts={shifts}
            employees={employeesData?.results || []}
          />
        </CardContent>
      </Card>
    </div>
  );
}
