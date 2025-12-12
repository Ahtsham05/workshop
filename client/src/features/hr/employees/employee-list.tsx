import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useLanguage } from '@/context/language-context';

type NavigateOptions = Parameters<ReturnType<typeof useNavigate>>[0];
import { useGetEmployeesQuery, useDeleteEmployeeMutation } from '@/stores/hr.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Plus, 
  MoreVertical, 
  Edit, 
  Trash2, 
  Eye,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';

export default function EmployeeList() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useGetEmployeesQuery({
    page,
    limit: 10,
    search: search || undefined,
  });

  const [deleteEmployee, { isLoading: isDeleting }] = useDeleteEmployeeMutation();

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteEmployee(deleteId).unwrap();
      toast.success(t('Employee deleted successfully'));
      setDeleteId(null);
      refetch();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to delete employee'));
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      Active: { variant: 'default', className: 'bg-green-100 text-green-700' },
      Inactive: { variant: 'secondary', className: 'bg-gray-100 text-gray-700' },
      OnLeave: { variant: 'default', className: 'bg-yellow-100 text-yellow-700' },
      Terminated: { variant: 'destructive', className: 'bg-red-100 text-red-700' },
    };
    return variants[status] || variants.Active;
  };

  return (
    <div className="h-full w-full p-4 space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('Employees')}</CardTitle>
            <Button onClick={() => navigate({ to: '/hr/employees/create' } as NavigateOptions)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('Add Employee')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('Search by name, email, or employee ID...')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-10"
              />
            </div>
          </div>

          {/* Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Employee ID')}</TableHead>
                  <TableHead>{t('Name')}</TableHead>
                  <TableHead>{t('Email')}</TableHead>
                  <TableHead>{t('Department')}</TableHead>
                  <TableHead>{t('Designation')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead className="text-right">{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      {t('Loading...')}
                    </TableCell>
                  </TableRow>
                ) : data?.results?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {t('No employees found')}
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.results?.map((employee: any) => (
                    <TableRow key={employee.id}>
                      <TableCell className="font-medium">{employee.employeeId}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {employee.profileImage && (
                            <img
                              src={employee.profileImage}
                              alt={employee.firstName}
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          )}
                          <span>{employee.firstName} {employee.lastName}</span>
                        </div>
                      </TableCell>
                      <TableCell>{employee.email}</TableCell>
                      <TableCell>{employee.department?.name || '-'}</TableCell>
                      <TableCell>{employee.designation?.title || '-'}</TableCell>
                      <TableCell>
                        <Badge {...getStatusBadge(employee.employmentStatus)}>
                          {employee.employmentStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => navigate({ to: `/hr/employees/${employee.id}` } as NavigateOptions)}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              {t('View Details')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => navigate({ to: `/hr/employees/${employee.id}/edit` } as NavigateOptions)}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              {t('Edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeleteId(employee.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {t('Delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                {t('Showing')} {((page - 1) * 10) + 1} {t('to')} {Math.min(page * 10, data.totalResults)} {t('of')} {data.totalResults} {t('employees')}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  {t('Page')} {page} {t('of')} {data.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                  disabled={page === data.totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        handleConfirm={handleDelete}
        title={t('Delete Employee')}
        desc={t('Are you sure you want to delete this employee? This action cannot be undone.')}
        confirmText={t('Delete')}
        cancelBtnText={t('Cancel')}
        isLoading={isDeleting}
        destructive
      />
    </div>
  );
}
