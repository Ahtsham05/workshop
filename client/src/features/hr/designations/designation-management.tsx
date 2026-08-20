import { useState } from 'react';
import { useLanguage } from '@/context/language-context';
import {
  useGetDesignationsQuery,
  useCreateDesignationMutation,
  useUpdateDesignationMutation,
  useDeleteDesignationMutation,
  useGetDepartmentsQuery,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Award,
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { getEntityId } from '@/lib/entity-id';
import { usePermissions } from '@/context/permission-context';

const NO_DEPARTMENT = '__none__';

export default function DesignationManagement() {
  const { t } = useLanguage();
  const { hasExplicitPermission } = usePermissions();
  const canCreate = hasExplicitPermission('createDesignations');
  const canEdit = hasExplicitPermission('manageDesignations');
  const canDelete = hasExplicitPermission('deleteDesignations');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editingDesignation, setEditingDesignation] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useGetDesignationsQuery({
    page,
    limit: 10,
    search: search || undefined,
  });
  const { data: departmentsData } = useGetDepartmentsQuery({ limit: 100 });
  const departments = departmentsData?.results || [];

  const [createDesignation, { isLoading: isCreating }] = useCreateDesignationMutation();
  const [updateDesignation, { isLoading: isUpdating }] = useUpdateDesignationMutation();
  const [deleteDesignation, { isLoading: isDeleting }] = useDeleteDesignationMutation();

  const emptyForm = {
    title: '',
    code: '',
    description: '',
    level: 1,
    department: NO_DEPARTMENT,
    isActive: true,
  };
  const [formData, setFormData] = useState(emptyForm);

  const handleSubmit = async () => {
    try {
      const payload = {
        ...formData,
        department: formData.department === NO_DEPARTMENT ? undefined : formData.department,
      };
      if (editingDesignation) {
        await updateDesignation({ id: getEntityId(editingDesignation), ...payload }).unwrap();
        toast.success(t('Designation updated successfully'));
      } else {
        await createDesignation(payload).unwrap();
        toast.success(t('Designation created successfully'));
      }
      setShowDialog(false);
      setEditingDesignation(null);
      setFormData(emptyForm);
      refetch();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to save designation'));
    }
  };

  const handleEdit = (designation: any) => {
    setEditingDesignation(designation);
    setFormData({
      title: designation.title,
      code: designation.code,
      description: designation.description || '',
      level: designation.level || 1,
      department: getEntityId(designation.department) || NO_DEPARTMENT,
      isActive: designation.isActive,
    });
    setShowDialog(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteDesignation(deleteId).unwrap();
      toast.success(t('Designation deleted successfully'));
      setDeleteId(null);
      refetch();
    } catch (error: any) {
      toast.error(error?.data?.message || t('Failed to delete designation'));
    }
  };

  return (
    <div className="h-full w-full p-4 space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('Total Designations')}</p>
                <p className="text-3xl font-bold">{data?.totalResults || 0}</p>
              </div>
              <div className="p-3 rounded-full bg-blue-50">
                <Award className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('Active')}</p>
                <p className="text-3xl font-bold text-green-600">
                  {data?.results?.filter((d: any) => d.isActive).length || 0}
                </p>
              </div>
              <div className="p-3 rounded-full bg-green-50">
                <Award className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('Inactive')}</p>
                <p className="text-3xl font-bold text-gray-600">
                  {data?.results?.filter((d: any) => !d.isActive).length || 0}
                </p>
              </div>
              <div className="p-3 rounded-full bg-gray-50">
                <Award className="h-6 w-6 text-gray-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Designation List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('Designations')}</CardTitle>
            {canCreate && (
              <Button onClick={() => {
                setEditingDesignation(null);
                setFormData(emptyForm);
                setShowDialog(true);
              }}>
                <Plus className="h-4 w-4 mr-2" />
                {t('Add Designation')}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('Search designations...')}
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
                  <TableHead>{t('Code')}</TableHead>
                  <TableHead>{t('Title')}</TableHead>
                  <TableHead>{t('Department')}</TableHead>
                  <TableHead>{t('Level')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead className="text-right">{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      {t('Loading...')}
                    </TableCell>
                  </TableRow>
                ) : data?.results?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {t('No designations found')}
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.results?.map((designation: any) => (
                    <TableRow key={getEntityId(designation)}>
                      <TableCell className="font-medium">{designation.code}</TableCell>
                      <TableCell>{designation.title}</TableCell>
                      <TableCell>
                        {designation.department?.name || '-'}
                      </TableCell>
                      <TableCell>{designation.level}</TableCell>
                      <TableCell>
                        <Badge className={designation.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}>
                          {designation.isActive ? t('Active') : t('Inactive')}
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
                            {canEdit && (
                              <DropdownMenuItem onClick={() => handleEdit(designation)}>
                                <Edit className="h-4 w-4 mr-2" />
                                {t('Edit')}
                              </DropdownMenuItem>
                            )}
                            {canDelete && (
                              <DropdownMenuItem
                                onClick={() => setDeleteId(getEntityId(designation))}
                                className="text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                {t('Delete')}
                              </DropdownMenuItem>
                            )}
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
                {t('Showing')} {((page - 1) * 10) + 1} {t('to')} {Math.min(page * 10, data.totalResults)} {t('of')} {data.totalResults} {t('designations')}
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

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingDesignation ? t('Edit Designation') : t('Add Designation')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('Designation Title')} *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={t('e.g., Senior Software Engineer')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('Designation Code')} *</Label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder={t('e.g., SSE')}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('Level')}</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.level}
                  onChange={(e) => setFormData({ ...formData, level: Number(e.target.value) || 1 })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('Department')}</Label>
              <Select
                value={formData.department}
                onValueChange={(value) => setFormData({ ...formData, department: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('Select department')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_DEPARTMENT}>{t('None')}</SelectItem>
                  {departments.map((dept: any) => (
                    <SelectItem key={getEntityId(dept)} value={getEntityId(dept)}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('Description')}</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('Designation description...')}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="h-4 w-4"
              />
              <Label htmlFor="isActive">{t('Active')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              {t('Cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={isCreating || isUpdating}>
              {isCreating || isUpdating ? t('Saving...') : t('Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        handleConfirm={handleDelete}
        title={t('Delete Designation')}
        desc={t('Are you sure you want to delete this designation? This action cannot be undone.')}
        confirmText={t('Delete')}
        cancelBtnText={t('Cancel')}
        isLoading={isDeleting}
        destructive
      />
    </div>
  );
}
