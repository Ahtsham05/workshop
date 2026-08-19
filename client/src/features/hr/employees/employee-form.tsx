import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLanguage } from '@/context/language-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Save,
  X,
  User,
  Briefcase,
  Wallet,
  Info,
  MapPin,
  CreditCard,
  Heart,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  CalendarOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getEntityId } from '@/lib/entity-id';
import toast from 'react-hot-toast';

const numericField = z.coerce.number().min(0);

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
    postalCode: z.string().optional(),
  }).optional(),

  // Professional Information
  department: z.string().min(1, 'Department is required'),
  designation: z.string().optional(),
  shift: z.string().optional(),
  joiningDate: z.string().min(1, 'Joining date is required'),
  employmentType: z.enum(['Full-Time', 'Part-Time', 'Contract', 'Intern']),
  employmentStatus: z.enum(['Active', 'On Leave', 'Terminated', 'Resigned']),
  lastWorkingDate: z.string().optional(),
  exitReason: z.string().optional(),
  reportingManager: z.string().optional(),

  // Salary Information
  salary: z.object({
    basicSalary: numericField,
    allowances: numericField,
    deductions: numericField,
  }),

  // Bank Information
  bankDetails: z.object({
    accountNumber: z.string().optional(),
    bankName: z.string().optional(),
    accountTitle: z.string().optional(),
    branchCode: z.string().optional(),
  }).optional(),

  // Emergency Contact
  emergencyContact: z.object({
    name: z.string().optional(),
    relationship: z.string().optional(),
    phone: z.string().optional(),
  }).optional(),

  skills: z.array(z.string()).optional(),
}).superRefine((data, ctx) => {
  if (['Terminated', 'Resigned'].includes(data.employmentStatus) && !data.lastWorkingDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Last working date is required when ending employment',
      path: ['lastWorkingDate'],
    });
  }
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

const STATUS_DOT: Record<string, string> = {
  Active: 'bg-emerald-500',
  'On Leave': 'bg-amber-500',
  Terminated: 'bg-red-500',
  Resigned: 'bg-muted-foreground',
};

/** Wizard steps, in order — drives both the tab strip and the Previous/Next/Save
 * footer below it, so the two stay in sync. */
const STEPS = [
  { id: 'personal', label: 'Personal', icon: User },
  { id: 'professional', label: 'Professional', icon: Briefcase },
  { id: 'salary', label: 'Salary', icon: Wallet },
  { id: 'other', label: 'Other', icon: Info },
] as const;

/** Maps each top-level schema field to the step that shows it, so a validation
 * error on Save (which can land on any field, regardless of which step is
 * currently open) jumps the wizard back to where the user can actually see it. */
const STEP_BY_FIELD: Record<string, number> = {
  firstName: 0, lastName: 0, email: 0, phone: 0, cnic: 0, dateOfBirth: 0, gender: 0, address: 0,
  department: 1, designation: 1, shift: 1, joiningDate: 1, employmentType: 1, employmentStatus: 1, reportingManager: 1,
  lastWorkingDate: 1, exitReason: 1,
  salary: 2, bankDetails: 2,
  emergencyContact: 3, skills: 3,
};

/** Groups related fields under a light bordered panel with an icon heading —
 * keeps Address/Bank/Emergency Contact visually distinct from the core fields
 * above them without stacking another full Card (which doubled up borders/
 * shadows and made the form feel boxed-within-a-box). */
function FieldGroup({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {title}
      </div>
      {children}
    </div>
  );
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

  const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

  const sanitizeObjectId = (value?: string) => {
    if (!value || !OBJECT_ID_REGEX.test(value)) {
      return undefined;
    }
    return value;
  };

  const hasMeaningfulValue = (value: unknown) => {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    return true;
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    defaultValues: initialData || {
      gender: 'Male',
      employmentType: 'Full-Time',
      employmentStatus: 'Active',
      salary: {
        basicSalary: 0,
        allowances: 0,
        deductions: 0,
      },
      address: {},
      bankDetails: {},
      emergencyContact: {},
    },
  });

  useEffect(() => {
    if (initialData) {
      reset({
        ...initialData,
        salary: {
          basicSalary: Number(initialData.salary?.basicSalary || 0),
          allowances: Number(initialData.salary?.allowances || 0),
          deductions: Number(initialData.salary?.deductions || 0),
        },
        department: getEntityId(initialData.department) || initialData.department,
        designation: getEntityId(initialData.designation) || '',
        reportingManager: getEntityId(initialData.reportingManager) || '',
        shift: getEntityId(initialData.shift) || '',
      });
    }
  }, [initialData, reset]);

  const [activeStep, setActiveStep] = useState(0);

  const firstName = watch('firstName');
  const lastName = watch('lastName');
  const employmentStatus = watch('employmentStatus');
  const basicSalary = watch('salary.basicSalary');
  const allowances = watch('salary.allowances');
  const deductions = watch('salary.deductions');
  const netSalary =
    (Number(basicSalary) || 0) + (Number(allowances) || 0) - (Number(deductions) || 0);
  const initials =
    `${(firstName || '').trim().charAt(0)}${(lastName || '').trim().charAt(0)}`.toUpperCase() || '?';

  return (
    <form
      onKeyDown={(e) => {
        // Hitting Enter in a text field natively submits its <form> in every evergreen
        // browser, even though the Save button (type="submit") isn't mounted at all
        // until the last step — only the Next/Previous buttons (type="button") are.
        // That's what was firing the create request while still on an earlier step.
        // Swallow it here and treat it the same as clicking Next instead.
        if (e.key !== 'Enter' || (e.target as HTMLElement).tagName !== 'INPUT') return
        if (activeStep < STEPS.length - 1) {
          e.preventDefault()
          setActiveStep((s) => s + 1)
        }
      }}
      onSubmit={(e) => {
        // Belt-and-suspenders on top of the Enter-key guard above: no matter what
        // triggers this submit event — Enter, a stray type="submit" somewhere,
        // browser autofill, anything — never actually let it through unless the
        // wizard is genuinely on its last step. This is the one place that can't
        // be bypassed, since it's the actual submit handler, not just one of the
        // things that can cause a submit.
        if (activeStep !== STEPS.length - 1) {
          e.preventDefault();
          return;
        }
        return handleSubmit(
        async (values) => {
        const payload: any = {
          ...values,
          department: getEntityId(values.department) || values.department,
          designation: sanitizeObjectId(values.designation),
          shift: sanitizeObjectId(values.shift),
          reportingManager: sanitizeObjectId(values.reportingManager),
        };

        if (payload.employmentStatus === 'Inactive') {
          payload.employmentStatus = 'Resigned';
        }
        if (payload.employmentStatus === 'OnLeave') {
          payload.employmentStatus = 'On Leave';
        }

        if (!['Terminated', 'Resigned'].includes(payload.employmentStatus)) {
          delete payload.lastWorkingDate;
          delete payload.exitReason;
        } else if (!payload.lastWorkingDate) {
          delete payload.lastWorkingDate;
        }

        if (!payload.shift) {
          delete payload.shift;
        }
        if (!payload.designation) {
          delete payload.designation;
        }
        if (!payload.reportingManager) {
          delete payload.reportingManager;
        }

        if (payload.address && !Object.values(payload.address).some(hasMeaningfulValue)) {
          delete payload.address;
        }
        if (payload.bankDetails && !Object.values(payload.bankDetails).some(hasMeaningfulValue)) {
          delete payload.bankDetails;
        }
        if (payload.emergencyContact && !Object.values(payload.emergencyContact).some(hasMeaningfulValue)) {
          delete payload.emergencyContact;
        }

        await onSubmit(payload);
        },
        (formErrors) => {
          // The error can be on any step, not just the one currently open — jump the
          // wizard back to wherever it actually is so the user can see and fix it.
          const firstErrorField = Object.keys(formErrors)[0];
          if (firstErrorField && STEP_BY_FIELD[firstErrorField] !== undefined) {
            setActiveStep(STEP_BY_FIELD[firstErrorField]);
          }
          const firstError = Object.values(formErrors)[0] as { message?: string } | undefined;
          toast.error(firstError?.message || t('Please fix the form errors before saving'));
        },
        )(e);
      }}
      className="space-y-5"
    >
      {/* Identity strip — a quick visual anchor for who this form is about, and the
          one place Employment Status is glanceable without switching tabs. */}
      <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
        <Avatar className="size-10 border">
          <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {firstName || lastName ? `${firstName || ''} ${lastName || ''}`.trim() : t('New employee')}
          </p>
          <p className="text-xs text-muted-foreground">{t('Employee ID is assigned automatically on save')}</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium shrink-0">
          <span className={cn('size-1.5 rounded-full', STATUS_DOT[employmentStatus] || 'bg-muted-foreground')} />
          {t(employmentStatus || 'Active')}
        </div>
      </div>

      <Tabs
        value={STEPS[activeStep].id}
        onValueChange={(value) => setActiveStep(STEPS.findIndex((s) => s.id === value))}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-4">
          {STEPS.map((step) => (
            <TabsTrigger key={step.id} value={step.id} className="gap-1.5">
              <step.icon className="h-3.5 w-3.5" />
              {t(step.label)}
            </TabsTrigger>
          ))}
        </TabsList>
        <p className="pt-1.5 text-center text-xs text-muted-foreground">
          {t('Step')} {activeStep + 1} {t('of')} {STEPS.length}
        </p>

        {/* Personal Information */}
        <TabsContent value="personal" className="mt-4 space-y-4">
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
              <Input id="phone" fieldType='phone' {...register('phone')} />
              {errors.phone && (
                <p className="text-sm text-red-600">{errors.phone.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cnic">{t('CNIC')}</Label>
              <Input id="cnic" fieldType='cnic' {...register('cnic')} />
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

          <FieldGroup icon={MapPin} title={t('Address')}>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder={t('Street')} {...register('address.street')} />
              <Input placeholder={t('City')} {...register('address.city')} />
              <Input placeholder={t('State')} {...register('address.state')} />
              <Input placeholder={t('Country')} {...register('address.country')} />
              <Input placeholder={t('Postal Code')} {...register('address.postalCode')} />
            </div>
          </FieldGroup>
        </TabsContent>

        {/* Professional Information */}
        <TabsContent value="professional" className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="joiningDate">{t('Joining Date')} *</Label>
              <Input id="joiningDate" type="date" {...register('joiningDate')} />
              {errors.joiningDate && (
                <p className="text-sm text-red-600">{errors.joiningDate.message}</p>
              )}
            </div>
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
                    <SelectItem key={getEntityId(dept)} value={getEntityId(dept)}>
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
              <Label htmlFor="designation">{t('Designation')}</Label>
              <Select
                value={watch('designation')}
                onValueChange={(value) => setValue('designation', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('Select designation')} />
                </SelectTrigger>
                <SelectContent>
                  {designations.map((designation) => (
                    <SelectItem key={getEntityId(designation)} value={getEntityId(designation)}>
                      {designation.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  <SelectItem value="Intern">{t('Intern')}</SelectItem>
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
                  {(['Active', 'On Leave', 'Terminated', 'Resigned'] as const).map((status) => (
                    <SelectItem key={status} value={status}>
                      <span className="flex items-center gap-2">
                        <span className={cn('size-1.5 rounded-full', STATUS_DOT[status])} />
                        {t(status)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {['Terminated', 'Resigned'].includes(employmentStatus) && (
            <FieldGroup icon={CalendarOff} title={t('Exit Details')}>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lastWorkingDate">{t('Last Working Date')} *</Label>
                  <Input id="lastWorkingDate" type="date" {...register('lastWorkingDate')} />
                  {errors.lastWorkingDate && (
                    <p className="text-sm text-red-600">{t(errors.lastWorkingDate.message || '')}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exitReason">{t('Exit Reason')}</Label>
                  <Textarea
                    id="exitReason"
                    placeholder={t('Reason for termination/resignation...')}
                    {...register('exitReason')}
                  />
                </div>
              </div>
            </FieldGroup>
          )}

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
                  <SelectItem key={getEntityId(emp)} value={getEntityId(emp)}>
                    {emp.firstName} {emp.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </TabsContent>

        {/* Salary Information */}
        <TabsContent value="salary" className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-4">
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
              <Label htmlFor="allowances">{t('Total Allowances')}</Label>
              <Input
                id="allowances"
                type="number"
                placeholder="0"
                {...register('salary.allowances', { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deductions">{t('Total Deductions')}</Label>
              <Input
                id="deductions"
                type="number"
                placeholder="0"
                {...register('salary.deductions', { valueAsNumber: true })}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border bg-emerald-50 px-4 py-3 text-sm dark:bg-emerald-950/20">
            <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-muted-foreground">{t('Net Salary')}:</span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              Rs {netSalary.toLocaleString()}
            </span>
          </div>

          <FieldGroup icon={CreditCard} title={t('Bank Details')}>
            <div className="grid grid-cols-2 gap-3">
              <Input
                placeholder={t('Account Number')}
                {...register('bankDetails.accountNumber')}
              />
              <Input placeholder={t('Bank Name')} {...register('bankDetails.bankName')} />
              <Input
                placeholder={t('Account Title')}
                {...register('bankDetails.accountTitle')}
              />
              <Input placeholder={t('Branch Code')} {...register('bankDetails.branchCode')} />
            </div>
          </FieldGroup>
        </TabsContent>

        {/* Other Information */}
        <TabsContent value="other" className="mt-4 space-y-4">
          <FieldGroup icon={Heart} title={t('Emergency Contact')}>
            <div className="grid grid-cols-3 gap-3">
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
          </FieldGroup>
        </TabsContent>
      </Tabs>

      {/* Action Buttons — Previous/Next walk the wizard; Save only appears on the
          last step so there's no way to submit without seeing every tab first. */}
      <div className="flex items-center justify-between gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          <X className="h-4 w-4 mr-2" />
          {t('Cancel')}
        </Button>
        <div className="flex gap-2">
          {activeStep > 0 && (
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={(e) => {
                // Belt-and-suspenders, same as onSubmit above: this is already
                // type="button" so it can't submit on its own, but stopping the
                // event outright leaves zero room for any ambiguity.
                e.preventDefault();
                e.stopPropagation();
                setActiveStep((s) => s - 1);
              }}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t('Previous')}
            </Button>
          )}
          {activeStep < STEPS.length - 1 ? (
            <Button
              type="button"
              disabled={isLoading}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveStep((s) => s + 1);
              }}
            >
              {t('Next')}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button type="submit" disabled={isLoading}>
              <Save className="h-4 w-4 mr-2" />
              {isLoading ? t('Saving...') : t('Save')}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
