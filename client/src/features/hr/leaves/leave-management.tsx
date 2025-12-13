import { useState } from 'react';
import { useLanguage } from '@/context/language-context';
import {
  useGetLeavesQuery,
  useCreateLeaveMutation,
  useApproveLeaveMutation,
  useRejectLeaveMutation,
  useGetEmployeesQuery,
} from '@/stores/hr.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Calendar,
  Plus,
  Check,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function LeaveManagement() {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<any>(null);

  const { data, isLoading, refetch } = useGetLeavesQuery({
    page,
    limit: 10,
    search: search || undefined,
    status: statusFilter || undefined,
  });

  const { data: employeesData } = useGetEmployeesQuery({
    limit: 100,
    employmentStatus: 'Active',
  });

  const [createLeave, { isLoading: isCreating }] = useCreateLeaveMutation();
  const [approveLeave, { isLoading: isApproving }] = useApproveLeaveMutation();
  const [rejectLeave, { isLoading: isRejecting }] = useRejectLeaveMutation();

  const [formData, setFormData] = useState({
    employee: '',
    leaveType: 'Sick',
    startDate: '',
    endDate: '',
    reason: '',
    isHalfDay: false,
  });

  const handleApplyLeave = async () => {
    try {
      await createLeave(formData).unwrap();
      toast.success(t('Leave application submitted'));
      setShowApplyDialog(false);
      setFormData({
        employee: '',
        leaveType: 'Sick',
        startDate: '',
        endDate: '',
        reason: '',
        isHalfDay: false,
      });
      refetch();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to apply leave'));
    }
  };

  const handleApprove = async (leaveId: string) => {
    try {
      await approveLeave({ id: leaveId }).unwrap();
      toast.success(t('Leave approved'));
      refetch();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to approve leave'));
    }
  };

  const handleReject = async (leaveId: string, reason: string) => {
    try {
      await rejectLeave({ id: leaveId, rejectionReason: reason }).unwrap();
      toast.success(t('Leave rejected'));
      setSelectedLeave(null);
      refetch();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to reject leave'));
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      Pending: { className: 'bg-yellow-100 text-yellow-700' },
      Approved: { className: 'bg-green-100 text-green-700' },
      Rejected: { className: 'bg-red-100 text-red-700' },
      Cancelled: { className: 'bg-gray-100 text-gray-700' },
    };
    return variants[status] || variants.Pending;
  };

  const leaveTypes = [
    { value: 'Casual', label: 'Casual Leave' },
    { value: 'Sick', label: 'Sick Leave' },
    { value: 'Annual', label: 'Annual Leave' },
    { value: 'Maternity', label: 'Maternity Leave' },
    { value: 'Paternity', label: 'Paternity Leave' },
    { value: 'Unpaid', label: 'Unpaid Leave' },
    { value: 'Emergency', label: 'Emergency Leave' },
  ];

  const getLeaveTypeLabel = (value: string) => {
    return leaveTypes.find(type => type.value === value)?.label || value;
  };

  return (
    <div className="h-full w-full p-4 space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('Pending')}</p>
                <p className="text-3xl font-bold text-yellow-600">
                  {data?.results?.filter((l: any) => l.status === 'Pending').length || 0}
                </p>
              </div>
              <div className="p-3 rounded-full bg-yellow-50">
                <Calendar className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('Approved')}</p>
                <p className="text-3xl font-bold text-green-600">
                  {data?.results?.filter((l: any) => l.status === 'Approved').length || 0}
                </p>
              </div>
              <div className="p-3 rounded-full bg-green-50">
                <Calendar className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('Rejected')}</p>
                <p className="text-3xl font-bold text-red-600">
                  {data?.results?.filter((l: any) => l.status === 'Rejected').length || 0}
                </p>
              </div>
              <div className="p-3 rounded-full bg-red-50">
                <Calendar className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('Total Leaves')}</p>
                <p className="text-3xl font-bold">{data?.totalResults || 0}</p>
              </div>
              <div className="p-3 rounded-full bg-blue-50">
                <Calendar className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Leave List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('Leave Requests')}</CardTitle>
            <Button onClick={() => setShowApplyDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('Apply Leave')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('Search employees...')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(value) => {
              setStatusFilter(value === 'all' ? '' : value);
              setPage(1);
            }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t('All Status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('All Status')}</SelectItem>
                <SelectItem value="Pending">{t('Pending')}</SelectItem>
                <SelectItem value="Approved">{t('Approved')}</SelectItem>
                <SelectItem value="Rejected">{t('Rejected')}</SelectItem>
                <SelectItem value="Cancelled">{t('Cancelled')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Employee')}</TableHead>
                  <TableHead>{t('Leave Type')}</TableHead>
                  <TableHead>{t('Start Date')}</TableHead>
                  <TableHead>{t('End Date')}</TableHead>
                  <TableHead>{t('Days')}</TableHead>
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
                      {t('No leave requests found')}
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.results?.map((leave: any) => (
                    <TableRow key={leave.id}>
                      <TableCell className="font-medium">
                        {leave.employee?.firstName} {leave.employee?.lastName}
                      </TableCell>
                      <TableCell>{getLeaveTypeLabel(leave.leaveType)}</TableCell>
                      <TableCell>{format(new Date(leave.startDate), 'MMM dd, yyyy')}</TableCell>
                      <TableCell>{format(new Date(leave.endDate), 'MMM dd, yyyy')}</TableCell>
                      <TableCell>
                        {leave.totalDays} {leave.isHalfDay ? '(Half Day)' : ''}
                      </TableCell>
                      <TableCell>
                        <Badge {...getStatusBadge(leave.status)}>{leave.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {leave.status === 'Pending' && (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600"
                              onClick={() => handleApprove(leave.id)}
                              disabled={isApproving}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              {t('Approve')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              onClick={() => setSelectedLeave(leave)}
                              disabled={isRejecting}
                            >
                              <X className="h-4 w-4 mr-1" />
                              {t('Reject')}
                            </Button>
                          </div>
                        )}
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
                {t('Showing')} {((page - 1) * 10) + 1} {t('to')} {Math.min(page * 10, data.totalResults)} {t('of')} {data.totalResults} {t('leaves')}
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

      {/* Apply Leave Dialog */}
      <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Apply for Leave')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('Employee')}</Label>
              <Select
                value={formData.employee}
                onValueChange={(value) => setFormData({ ...formData, employee: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('Select employee')} />
                </SelectTrigger>
                <SelectContent>
                  {employeesData?.results?.map((emp: any) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.employeeId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('Leave Type')}</Label>
              <Select
                value={formData.leaveType}
                onValueChange={(value) => setFormData({ ...formData, leaveType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {leaveTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {t(type.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('Start Date')}</Label>
                <Input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('End Date')}</Label>
                <Input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('Reason')}</Label>
              <Textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder={t('Reason for leave...')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApplyDialog(false)}>
              {t('Cancel')}
            </Button>
            <Button 
              onClick={handleApplyLeave} 
              disabled={isCreating || !formData.employee || !formData.startDate || !formData.endDate}
            >
              {isCreating ? t('Submitting...') : t('Submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Leave Dialog */}
      <Dialog open={!!selectedLeave} onOpenChange={(open) => !open && setSelectedLeave(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Reject Leave Request')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('Are you sure you want to reject this leave request?')}
            </p>
            <div className="space-y-2">
              <Label>{t('Rejection Reason')}</Label>
              <Textarea
                placeholder={t('Reason for rejection...')}
                id="rejectionReason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedLeave(null)}>
              {t('Cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const reason = (document.getElementById('rejectionReason') as HTMLTextAreaElement)?.value;
                handleReject(selectedLeave.id, reason);
              }}
              disabled={isRejecting}
            >
              {isRejecting ? t('Rejecting...') : t('Reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
