import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useLanguage } from '@/context/language-context';
import { useGetEmployeeQuery } from '@/stores/hr.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Mail, Phone, MapPin, Calendar, Briefcase, DollarSign, User } from 'lucide-react';
import { format } from 'date-fns';

type NavigateOptions = Parameters<ReturnType<typeof useNavigate>>[0];

export const Route = createFileRoute('/_authenticated/hr/employees/$id')({
  component: EmployeeDetails,
});

function EmployeeDetails() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { id } = Route.useParams();

  const { data: employee, isLoading } = useGetEmployeeQuery(id);

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <p>{t('Loading...')}</p>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <p>{t('Employee not found')}</p>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      Active: 'bg-green-100 text-green-700',
      Inactive: 'bg-gray-100 text-gray-700',
      OnLeave: 'bg-yellow-100 text-yellow-700',
      Terminated: 'bg-red-100 text-red-700',
    };
    return variants[status] || variants.Active;
  };

  return (
    <div className="h-full w-full p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: '/hr/employees' } as NavigateOptions)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {employee.firstName} {employee.lastName}
            </h1>
            <p className="text-sm text-muted-foreground">{employee.employeeId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={getStatusBadge(employee.employmentStatus)}>
            {employee.employmentStatus}
          </Badge>
          <Button
            onClick={() => navigate({ to: `/hr/employees/${id}/edit` } as NavigateOptions)}
          >
            {t('Edit')}
          </Button>
        </div>
      </div>

      {/* Profile Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-6">
            {employee.profileImage ? (
              <img
                src={employee.profileImage}
                alt={employee.firstName}
                className="h-24 w-24 rounded-full object-cover"
              />
            ) : (
              <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center">
                <User className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">{t('Email')}</p>
                  <p className="text-sm font-medium">{employee.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">{t('Phone')}</p>
                  <p className="text-sm font-medium">{employee.phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">{t('Department')}</p>
                  <p className="text-sm font-medium">{employee.department?.name || '-'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">{t('Joining Date')}</p>
                  <p className="text-sm font-medium">
                    {employee.joiningDate ? format(new Date(employee.joiningDate), 'MMM dd, yyyy') : '-'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Information Tabs */}
      <Tabs defaultValue="personal" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="personal">{t('Personal')}</TabsTrigger>
          <TabsTrigger value="professional">{t('Professional')}</TabsTrigger>
          <TabsTrigger value="salary">{t('Salary')}</TabsTrigger>
          <TabsTrigger value="documents">{t('Documents')}</TabsTrigger>
        </TabsList>

        {/* Personal Information */}
        <TabsContent value="personal">
          <Card>
            <CardHeader>
              <CardTitle>{t('Personal Information')}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">{t('Full Name')}</p>
                <p className="font-medium">{employee.firstName} {employee.lastName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('Gender')}</p>
                <p className="font-medium">{employee.gender}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('Date of Birth')}</p>
                <p className="font-medium">
                  {employee.dateOfBirth ? format(new Date(employee.dateOfBirth), 'MMM dd, yyyy') : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('CNIC')}</p>
                <p className="font-medium">{employee.cnic || '-'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground mb-1">
                  <MapPin className="h-4 w-4 inline mr-1" />
                  {t('Address')}
                </p>
                <p className="font-medium">
                  {employee.address ? (
                    <>
                      {employee.address.street && `${employee.address.street}, `}
                      {employee.address.city && `${employee.address.city}, `}
                      {employee.address.state && `${employee.address.state}, `}
                      {employee.address.country} {employee.address.zipCode}
                    </>
                  ) : '-'}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground mb-2">{t('Emergency Contact')}</p>
                {employee.emergencyContact ? (
                  <div className="grid grid-cols-3 gap-4 bg-muted p-3 rounded-lg">
                    <div>
                      <p className="text-xs text-muted-foreground">{t('Name')}</p>
                      <p className="font-medium">{employee.emergencyContact.name || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('Relationship')}</p>
                      <p className="font-medium">{employee.emergencyContact.relationship || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('Phone')}</p>
                      <p className="font-medium">{employee.emergencyContact.phone || '-'}</p>
                    </div>
                  </div>
                ) : '-'}
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
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">{t('Employee ID')}</p>
                <p className="font-medium">{employee.employeeId}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('Department')}</p>
                <p className="font-medium">{employee.department?.name || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('Designation')}</p>
                <p className="font-medium">{employee.designation?.title || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('Shift')}</p>
                <p className="font-medium">{employee.shift?.name || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('Employment Type')}</p>
                <p className="font-medium">{employee.employmentType}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('Employment Status')}</p>
                <Badge className={getStatusBadge(employee.employmentStatus)}>
                  {employee.employmentStatus}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('Joining Date')}</p>
                <p className="font-medium">
                  {employee.joiningDate ? format(new Date(employee.joiningDate), 'MMM dd, yyyy') : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('Reporting Manager')}</p>
                <p className="font-medium">
                  {employee.reportingManager ? `${employee.reportingManager.firstName} ${employee.reportingManager.lastName}` : '-'}
                </p>
              </div>
              {employee.skills && employee.skills.length > 0 && (
                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground mb-2">{t('Skills')}</p>
                  <div className="flex flex-wrap gap-2">
                    {employee.skills.map((skill: string, index: number) => (
                      <Badge key={index} variant="secondary">{skill}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Salary Information */}
        <TabsContent value="salary">
          <Card>
            <CardHeader>
              <CardTitle>
                <DollarSign className="h-5 w-5 inline mr-2" />
                {t('Salary Information')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-muted-foreground">{t('Basic Salary')}</p>
                  <p className="text-2xl font-bold text-blue-600">
                    Rs {employee.salary?.basicSalary?.toLocaleString() || '0'}
                  </p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-muted-foreground">{t('Total Allowances')}</p>
                  <p className="text-2xl font-bold text-green-600">
                    Rs {typeof employee.salary?.allowances === 'number' 
                      ? employee.salary.allowances.toLocaleString() 
                      : employee.salary?.allowances 
                        ? (Object.values(employee.salary.allowances as Record<string, number>).reduce((a, b) => a + b, 0)).toLocaleString()
                        : '0'}
                  </p>
                </div>Argument of type '"/_authenticated/hr/employees/create"' is not assignable to parameter of type 'keyof FileRoutesByPath'.ts(2345)

              </div>

              {employee.salary?.allowances && (
                <div>
                  <p className="text-sm font-semibold mb-3">{t('Allowances Breakdown')}</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(employee.salary.allowances).map(([key, value]: [string, any]) => (
                      <div key={key} className="p-3 border rounded-lg">
                        <p className="text-xs text-muted-foreground capitalize">{key}</p>
                        <p className="font-medium">Rs {value.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {employee.salary?.deductions && (
                <div>
                  <p className="text-sm font-semibold mb-3">{t('Deductions')}</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(employee.salary.deductions).map(([key, value]: [string, any]) => (
                      <div key={key} className="p-3 border rounded-lg">
                        <p className="text-xs text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1')}</p>
                        <p className="font-medium text-red-600">Rs {value.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {employee.bankDetails && (
                <div>
                  <p className="text-sm font-semibold mb-3">{t('Bank Details')}</p>
                  <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                    <div>
                      <p className="text-xs text-muted-foreground">{t('Bank Name')}</p>
                      <p className="font-medium">{employee.bankDetails.bankName || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('Account Number')}</p>
                      <p className="font-medium">{employee.bankDetails.accountNumber || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('Branch')}</p>
                      <p className="font-medium">{employee.bankDetails.branchName || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t('IFSC Code')}</p>
                      <p className="font-medium">{employee.bankDetails.ifscCode || '-'}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <CardTitle>{t('Documents')}</CardTitle>
            </CardHeader>
            <CardContent>
              {employee.documents && employee.documents.length > 0 ? (
                <div className="space-y-3">
                  {employee.documents.map((doc: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{doc.name}</p>
                        <p className="text-sm text-muted-foreground">{doc.type}</p>
                      </div>
                      <Button variant="outline" size="sm">
                        {t('Download')}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">{t('No documents uploaded')}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
