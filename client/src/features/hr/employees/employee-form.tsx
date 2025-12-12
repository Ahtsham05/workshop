import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLanguage } from '@/context/language-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, X } from 'lucide-react';

const employeeSchema = z.object({
  // Personal Information
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
  cnic: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['Male', 'Female', 'Other']),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    zipCode: z.string().optional(),
  }).optional(),
  
  // Professional Information
  employeeId: z.string().min(1, 'Employee ID is required'),
  department: z.string().min(1, 'Department is required'),
  designation: z.string().min(1, 'Designation is required'),
  shift: z.string().optional(),
  joiningDate: z.string().min(1, 'Joining date is required'),
  employmentType: z.enum(['Full-Time', 'Part-Time', 'Contract', 'Internship']),
  employmentStatus: z.enum(['Active', 'Inactive', 'OnLeave', 'Terminated']),
  reportingManager: z.string().optional(),
  
  // Salary Information
  salary: z.object({
    basicSalary: z.number().min(0, 'Basic salary must be positive'),
    allowances: z.object({
      housing: z.number(),
      transport: z.number(),
      medical: z.number(),
      food: z.number(),
      other: z.number(),
    }),
    deductions: z.object({
      tax: z.number(),
      insurance: z.number(),
      providentFund: z.number(),
      other: z.number(),
    }),
  }),
  
  // Bank Information
  bankDetails: z.object({
    accountNumber: z.string().optional(),
    bankName: z.string().optional(),
    branchName: z.string().optional(),
    ifscCode: z.string().optional(),
  }).optional(),
  
  // Emergency Contact
  emergencyContact: z.object({
    name: z.string().optional(),
    relationship: z.string().optional(),
    phone: z.string().optional(),
  }).optional(),
  
  skills: z.array(z.string()).optional(),
});

type EmployeeFormData = z.infer<typeof employeeSchema>;

interface EmployeeFormProps {
  initialData?: any;
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  departments: any[];
  designations: any[];
  shifts: any[];
  employees: any[];
}

export default function EmployeeForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading,
  departments,
  designations,
  shifts,
  employees,
}: EmployeeFormProps) {
  const { t } = useLanguage();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    defaultValues: initialData || {
      gender: 'Male',
      employmentType: 'Full-Time',
      employmentStatus: 'Active',
      salary: {
        basicSalary: 0,
        allowances: { housing: 0, transport: 0, medical: 0, food: 0, other: 0 },
        deductions: { tax: 0, insurance: 0, providentFund: 0, other: 0 },
      },
      address: {},
      bankDetails: {},
      emergencyContact: {},
    },
  });

  useEffect(() => {
    if (initialData) {
      Object.keys(initialData).forEach((key) => {
        setValue(key as any, initialData[key]);
      });
    }
  }, [initialData, setValue]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Tabs defaultValue="personal" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="personal">{t('Personal')}</TabsTrigger>
          <TabsTrigger value="professional">{t('Professional')}</TabsTrigger>
          <TabsTrigger value="salary">{t('Salary')}</TabsTrigger>
          <TabsTrigger value="other">{t('Other')}</TabsTrigger>
        </TabsList>

        {/* Personal Information */}
        <TabsContent value="personal">
          <Card>
            <CardHeader>
              <CardTitle>{t('Personal Information')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">{t('First Name')} *</Label>
                  <Input id="firstName" {...register('firstName')} />
                  {errors.firstName && (
                    <p className="text-sm text-red-600">{errors.firstName.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">{t('Last Name')} *</Label>
                  <Input id="lastName" {...register('lastName')} />
                  {errors.lastName && (
                    <p className="text-sm text-red-600">{errors.lastName.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t('Email')} *</Label>
                  <Input id="email" type="email" {...register('email')} />
                  {errors.email && (
                    <p className="text-sm text-red-600">{errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">{t('Phone')} *</Label>
                  <Input id="phone" {...register('phone')} />
                  {errors.phone && (
                    <p className="text-sm text-red-600">{errors.phone.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cnic">{t('CNIC')}</Label>
                  <Input id="cnic" {...register('cnic')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">{t('Date of Birth')}</Label>
                  <Input id="dateOfBirth" type="date" {...register('dateOfBirth')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gender">{t('Gender')} *</Label>
                  <Select
                    value={watch('gender')}
                    onValueChange={(value) => setValue('gender', value as any)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">{t('Male')}</SelectItem>
                      <SelectItem value="Female">{t('Female')}</SelectItem>
                      <SelectItem value="Other">{t('Other')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('Address')}</Label>
                <div className="grid grid-cols-2 gap-4">
                  <Input placeholder={t('Street')} {...register('address.street')} />
                  <Input placeholder={t('City')} {...register('address.city')} />
                  <Input placeholder={t('State')} {...register('address.state')} />
                  <Input placeholder={t('Country')} {...register('address.country')} />
                  <Input placeholder={t('Zip Code')} {...register('address.zipCode')} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Professional Information */}
        <TabsContent value="professional">
          <Card>
            <CardHeader>
              <CardTitle>{t('Professional Information')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="employeeId">{t('Employee ID')} *</Label>
                  <Input id="employeeId" {...register('employeeId')} />
                  {errors.employeeId && (
                    <p className="text-sm text-red-600">{errors.employeeId.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="joiningDate">{t('Joining Date')} *</Label>
                  <Input id="joiningDate" type="date" {...register('joiningDate')} />
                  {errors.joiningDate && (
                    <p className="text-sm text-red-600">{errors.joiningDate.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="department">{t('Department')} *</Label>
                  <Select
                    value={watch('department')}
                    onValueChange={(value) => setValue('department', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('Select department')} />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.department && (
                    <p className="text-sm text-red-600">{errors.department.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="designation">{t('Designation')} *</Label>
                  <Select
                    value={watch('designation')}
                    onValueChange={(value) => setValue('designation', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('Select designation')} />
                    </SelectTrigger>
                    <SelectContent>
                      {designations.map((desig) => (
                        <SelectItem key={desig.id} value={desig.id}>
                          {desig.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.designation && (
                    <p className="text-sm text-red-600">{errors.designation.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="shift">{t('Shift')}</Label>
                  <Select
                    value={watch('shift')}
                    onValueChange={(value) => setValue('shift', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('Select shift')} />
                    </SelectTrigger>
                    <SelectContent>
                      {shifts.map((shift) => (
                        <SelectItem key={shift.id} value={shift.id}>
                          {shift.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employmentType">{t('Employment Type')} *</Label>
                  <Select
                    value={watch('employmentType')}
                    onValueChange={(value) => setValue('employmentType', value as any)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Full-Time">{t('Full-Time')}</SelectItem>
                      <SelectItem value="Part-Time">{t('Part-Time')}</SelectItem>
                      <SelectItem value="Contract">{t('Contract')}</SelectItem>
                      <SelectItem value="Internship">{t('Internship')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employmentStatus">{t('Status')} *</Label>
                  <Select
                    value={watch('employmentStatus')}
                    onValueChange={(value) => setValue('employmentStatus', value as any)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">{t('Active')}</SelectItem>
                      <SelectItem value="Inactive">{t('Inactive')}</SelectItem>
                      <SelectItem value="OnLeave">{t('On Leave')}</SelectItem>
                      <SelectItem value="Terminated">{t('Terminated')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reportingManager">{t('Reporting Manager')}</Label>
                <Select
                  value={watch('reportingManager')}
                  onValueChange={(value) => setValue('reportingManager', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('Select manager')} />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.firstName} {emp.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Salary Information */}
        <TabsContent value="salary">
          <Card>
            <CardHeader>
              <CardTitle>{t('Salary Information')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="basicSalary">{t('Basic Salary')} *</Label>
                <Input
                  id="basicSalary"
                  type="number"
                  {...register('salary.basicSalary', { valueAsNumber: true })}
                />
                {errors.salary?.basicSalary && (
                  <p className="text-sm text-red-600">{errors.salary.basicSalary.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>{t('Allowances')}</Label>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    placeholder={t('Housing')}
                    type="number"
                    {...register('salary.allowances.housing', { valueAsNumber: true })}
                  />
                  <Input
                    placeholder={t('Transport')}
                    type="number"
                    {...register('salary.allowances.transport', { valueAsNumber: true })}
                  />
                  <Input
                    placeholder={t('Medical')}
                    type="number"
                    {...register('salary.allowances.medical', { valueAsNumber: true })}
                  />
                  <Input
                    placeholder={t('Food')}
                    type="number"
                    {...register('salary.allowances.food', { valueAsNumber: true })}
                  />
                  <Input
                    placeholder={t('Other')}
                    type="number"
                    {...register('salary.allowances.other', { valueAsNumber: true })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('Deductions')}</Label>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    placeholder={t('Tax')}
                    type="number"
                    {...register('salary.deductions.tax', { valueAsNumber: true })}
                  />
                  <Input
                    placeholder={t('Insurance')}
                    type="number"
                    {...register('salary.deductions.insurance', { valueAsNumber: true })}
                  />
                  <Input
                    placeholder={t('Provident Fund')}
                    type="number"
                    {...register('salary.deductions.providentFund', { valueAsNumber: true })}
                  />
                  <Input
                    placeholder={t('Other')}
                    type="number"
                    {...register('salary.deductions.other', { valueAsNumber: true })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('Bank Details')}</Label>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    placeholder={t('Account Number')}
                    {...register('bankDetails.accountNumber')}
                  />
                  <Input placeholder={t('Bank Name')} {...register('bankDetails.bankName')} />
                  <Input
                    placeholder={t('Branch Name')}
                    {...register('bankDetails.branchName')}
                  />
                  <Input placeholder={t('IFSC Code')} {...register('bankDetails.ifscCode')} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Other Information */}
        <TabsContent value="other">
          <Card>
            <CardHeader>
              <CardTitle>{t('Other Information')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('Emergency Contact')}</Label>
                <div className="grid grid-cols-3 gap-4">
                  <Input
                    placeholder={t('Name')}
                    {...register('emergencyContact.name')}
                  />
                  <Input
                    placeholder={t('Relationship')}
                    {...register('emergencyContact.relationship')}
                  />
                  <Input
                    placeholder={t('Phone')}
                    {...register('emergencyContact.phone')}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          <X className="h-4 w-4 mr-2" />
          {t('Cancel')}
        </Button>
        <Button type="submit" disabled={isLoading}>
          <Save className="h-4 w-4 mr-2" />
          {isLoading ? t('Saving...') : t('Save')}
        </Button>
      </div>
    </form>
  );
}
