import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { toast } from 'sonner';
import EmployeeForm from '@/features/hr/employees/employee-form';
import {
  useGetEmployeeQuery,
  useUpdateEmployeeMutation,
  useGetDepartmentsQuery,
  useGetEmployeesQuery,
} from '@/stores/hr.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconArrowLeft, IconLoader } from '@tabler/icons-react';

export const Route = createFileRoute('/_authenticated/hr/employees/$id/edit')({
  component: EmployeeEditPage,
});

function EmployeeEditPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  // Fetch employee data
  const {
    data: employee,
    isLoading: employeeLoading,
    error: employeeError,
  } = useGetEmployeeQuery(id);

  // Fetch supporting data
  const { data: departmentsData } = useGetDepartmentsQuery({ page: 1, limit: 100 });
  const { data: employeesData } = useGetEmployeesQuery({ page: 1, limit: 1000 });

  // Mock data for designations and shifts
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

  // Update mutation
  const [updateEmployee, { isLoading: isUpdating }] = useUpdateEmployeeMutation();

  useEffect(() => {
    if (employeeError) {
      toast.error('Failed to load employee data');
      navigate({ to: '/hr/employees' } as any);
    }
  }, [employeeError, navigate]);

  const handleSubmit = async (data: any) => {
    try {
      await updateEmployee({ id, data }).unwrap();
      toast.success('Employee updated successfully');
      navigate({ to: '/hr/employees/$id', params: { id } } as any);
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to update employee');
    }
  };

  const handleCancel = () => {
    navigate({ to: '/hr/employees/$id', params: { id } } as any);
  };

  if (employeeLoading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <IconLoader className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading employee data...</p>
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <p className="text-muted-foreground">Employee not found</p>
      </div>
    );
  }

  // Transform employee data for form
  const initialData = {
    // Personal Information
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    phone: employee.phone,
    dateOfBirth: employee.dateOfBirth ? new Date(employee.dateOfBirth) : undefined,
    gender: employee.gender,
    maritalStatus: employee.maritalStatus,
    address: employee.address,
    city: employee.city,
    state: employee.state,
    country: employee.country,
    postalCode: employee.postalCode,

    // Professional Information
    employeeId: employee.employeeId,
    department: employee.department?._id || employee.department,
    designation: employee.designation?._id || employee.designation,
    manager: employee.manager?._id || employee.manager,
    dateOfJoining: employee.dateOfJoining ? new Date(employee.dateOfJoining) : undefined,
    employmentType: employee.employmentType,
    workLocation: employee.workLocation,
    shift: employee.shift?._id || employee.shift,
    probationEndDate: employee.probationEndDate
      ? new Date(employee.probationEndDate)
      : undefined,
    confirmationDate: employee.confirmationDate
      ? new Date(employee.confirmationDate)
      : undefined,
    status: employee.status,
    skills: employee.skills || [],
    qualification: employee.qualification,
    experience: employee.experience,

    // Salary Information
    basicSalary: employee.salary?.basic || 0,
    allowances: employee.salary?.allowances || 0,
    deductions: employee.salary?.deductions || 0,
    currency: employee.salary?.currency || 'PKR',
    paymentMode: employee.salary?.paymentMode || 'bank_transfer',
    bankName: employee.salary?.bankDetails?.bankName,
    accountNumber: employee.salary?.bankDetails?.accountNumber,
    ifscCode: employee.salary?.bankDetails?.ifscCode,
    accountHolderName: employee.salary?.bankDetails?.accountHolderName,

    // Other Information
    emergencyContactName: employee.emergencyContact?.name,
    emergencyContactRelation: employee.emergencyContact?.relation,
    emergencyContactPhone: employee.emergencyContact?.phone,
    bloodGroup: employee.bloodGroup,
    profileImage: employee.profileImage,
    documents: employee.documents || [],
  };

  const departments = departmentsData?.results || [];
  // Filter out current employee from managers list
  const employees =
    employeesData?.results?.filter((e: any) => e._id !== id) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleCancel}>
            <IconArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Edit Employee</h1>
            <p className="text-muted-foreground">
              Update employee information and details
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Employee Information</CardTitle>
        </CardHeader>
        <CardContent>
          <EmployeeForm
            initialData={initialData}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isLoading={isUpdating}
            departments={departments}
            designations={designations}
            shifts={shifts}
            employees={employees}
          />
        </CardContent>
      </Card>
    </div>
  );
}
