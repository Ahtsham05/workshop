import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Pencil, Trash2, Users, Phone, Mail, GraduationCap, Calendar, BookOpen, X } from 'lucide-react';
import { useGetTeachersQuery, useCreateTeacherMutation, useUpdateTeacherMutation, useDeleteTeacherMutation, useGetSubjectsQuery } from '@/stores/school.api';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

const GRADIENT_COLORS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-orange-500 to-amber-600',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-sky-600',
];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-green-100 text-green-700' },
  inactive: { label: 'Inactive', color: 'bg-gray-100 text-gray-500' },
  resigned: { label: 'Resigned', color: 'bg-red-100 text-red-600' },
  on_leave: { label: 'On Leave', color: 'bg-yellow-100 text-yellow-700' },
};

export default function TeacherList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<any>(null);

  const { data, isLoading } = useGetTeachersQuery({ limit: 200 });
  const [createTeacher] = useCreateTeacherMutation();
  const [updateTeacher] = useUpdateTeacherMutation();
  const [deleteTeacher] = useDeleteTeacherMutation();
  const { data: subjectsData } = useGetSubjectsQuery({ limit: 500 });
  const allSubjects: any[] = (subjectsData as any)?.results || [];

  // Group subjects by name (deduplicate across classes)
  const uniqueSubjects = useMemo(() => {
    const map = new Map<string, any>();
    allSubjects.forEach((s: any) => {
      const key = s.name;
      if (!map.has(key)) map.set(key, s);
    });
    return Array.from(map.values());
  }, [allSubjects]);

  const [form, setForm] = useState({
    employeeId: '', firstName: '', lastName: '', email: '', phone: '',
    gender: '', joiningDate: new Date().toISOString().split('T')[0], qualification: '', specialization: '', status: 'active',
    salary: { basicSalary: 0, allowances: 0 }, portalPassword: '', subjects: [] as string[],
  });

  const resetForm = () => {
    setForm({ employeeId: '', firstName: '', lastName: '', email: '', phone: '', gender: '', joiningDate: new Date().toISOString().split('T')[0], qualification: '', specialization: '', status: 'active', salary: { basicSalary: 0, allowances: 0 }, portalPassword: '', subjects: [] });
    setEditingTeacher(null);
  };

  const openAdd = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (teacher: any) => {
    setEditingTeacher(teacher);
    setForm({
      employeeId: teacher.employeeId || '', firstName: teacher.firstName || '',
      lastName: teacher.lastName || '', email: teacher.email || '',
      phone: teacher.phone || '', gender: teacher.gender || '',
      joiningDate: teacher.joiningDate?.split('T')[0] || '',
      qualification: teacher.qualification || '', specialization: teacher.specialization || '',
      status: teacher.status || 'active',
      salary: { basicSalary: teacher.salary?.basicSalary || 0, allowances: teacher.salary?.allowances || 0 },
      subjects: (teacher.subjects || []).map((s: any) => s._id || s.id || s),
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      if (editingTeacher) {
        await updateTeacher({ id: editingTeacher.id || editingTeacher._id, ...form }).unwrap();
        toast.success('Teacher updated');
      } else {
        await createTeacher(form).unwrap();
        toast.success('Teacher added');
      }
      setDialogOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed');
    }
  };

  const filtered = useMemo(() => {
    const all = data?.results || [];
    return all.filter((t: any) => {
      const matchSearch = !search || `${t.firstName} ${t.lastName} ${t.employeeId} ${t.email}`.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' || t.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [data, search, statusFilter]);

  return (
    <div className="h-full w-full p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Teachers</h1>
          <p className="text-muted-foreground">{data?.results?.length || 0} staff members</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" /> Add Teacher
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search teachers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="resigned">Resigned</SelectItem>
            <SelectItem value="on_leave">On Leave</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-52 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">No teachers found</h3>
          <Button className="mt-4" onClick={openAdd}><Plus className="mr-2 h-4 w-4" /> Add First Teacher</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((t: any, idx: number) => {
            const initials = `${t.firstName?.[0] || ''}${t.lastName?.[0] || ''}`.toUpperCase();
            const gradient = GRADIENT_COLORS[idx % GRADIENT_COLORS.length];
            const cfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.active;
            return (
              <Card key={t.id || t._id} className="group overflow-hidden hover:shadow-md transition-shadow">
                <div className={`h-20 bg-gradient-to-br ${gradient} relative`}>
                  <div className="absolute bottom-[-24px] left-4">
                    <div className="h-12 w-12 rounded-full bg-white flex items-center justify-center shadow-sm border-2 border-white">
                      <span className="text-sm font-bold text-gray-700">{initials || '?'}</span>
                    </div>
                  </div>
                  <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
                    <Button variant="secondary" size="icon" className="h-7 w-7 bg-white/80 hover:bg-white" onClick={() => openEdit(t)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="secondary" size="icon" className="h-7 w-7 bg-white/80 hover:bg-white">
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {t.firstName} {t.lastName}?</AlertDialogTitle>
                          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction className="bg-destructive" onClick={() => deleteTeacher(t.id || t._id).unwrap().then(() => toast.success('Deleted')).catch(() => toast.error('Failed'))}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                <CardContent className="pt-8 pb-4 px-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-sm leading-tight">{t.firstName} {t.lastName}</p>
                      <p className="text-xs text-muted-foreground">#{t.employeeId}</p>
                    </div>
                    <Badge className={`text-[10px] ${cfg.color}`}>{cfg.label}</Badge>
                  </div>
                  {t.specialization && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <GraduationCap className="h-3 w-3 shrink-0" />
                      <span className="truncate">{t.specialization}</span>
                    </div>
                  )}
                  {t.subjects?.length > 0 && (
                    <div className="flex items-start gap-1.5 text-xs">
                      <BookOpen className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" />
                      <div className="flex flex-wrap gap-1">
                        {t.subjects.slice(0, 3).map((sub: any) => (
                          <Badge key={sub._id || sub.id || sub} variant="outline" className="text-[10px] h-4 px-1.5 bg-indigo-50 text-indigo-700 border-indigo-200">
                            {sub.code || sub.name || 'Subject'}
                          </Badge>
                        ))}
                        {t.subjects.length > 3 && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5">+{t.subjects.length - 3}</Badge>
                        )}
                      </div>
                    </div>
                  )}
                  {t.phone && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3 shrink-0" />
                      <span>{t.phone}</span>
                    </div>
                  )}
                  {t.email && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{t.email}</span>
                    </div>
                  )}
                  {t.joiningDate && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3 shrink-0" />
                      <span>Joined {new Date(t.joiningDate).toLocaleDateString('en-PK', { month: 'short', year: 'numeric' })}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingTeacher ? `Edit — ${editingTeacher.firstName} ${editingTeacher.lastName}` : 'Add Teacher'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div>
              <Label>Employee ID</Label>
              <Input value={form.employeeId} onChange={(e) => setForm(p => ({...p, employeeId: e.target.value}))} placeholder="Auto-generated if empty" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm(p => ({...p, status: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="on_leave">On Leave</SelectItem>
                  <SelectItem value="resigned">Resigned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>First Name <span className="text-destructive">*</span></Label>
              <Input value={form.firstName} onChange={(e) => setForm(p => ({...p, firstName: e.target.value}))} autoFocus />
            </div>
            <div>
              <Label>Last Name</Label>
              <Input value={form.lastName} onChange={(e) => setForm(p => ({...p, lastName: e.target.value}))} />
            </div>
            <div>
              <Label>Email <span className="text-destructive">*</span></Label>
              <Input type="email" value={form.email} onChange={(e) => setForm(p => ({...p, email: e.target.value}))} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm(p => ({...p, phone: e.target.value}))} />
            </div>
            <div>
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={(v) => setForm(p => ({...p, gender: v}))}>
                <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Joining Date</Label>
              <Input type="date" value={form.joiningDate} onChange={(e) => setForm(p => ({...p, joiningDate: e.target.value}))} />
            </div>
            <div>
              <Label>Qualification</Label>
              <Input value={form.qualification} onChange={(e) => setForm(p => ({...p, qualification: e.target.value}))} placeholder="e.g. M.Ed, B.Sc" />
            </div>
            <div>
              <Label>Specialization</Label>
              <Input value={form.specialization} onChange={(e) => setForm(p => ({...p, specialization: e.target.value}))} placeholder="e.g. Mathematics" />
            </div>
            <div className="col-span-2">
              <Label>Subjects (can teach)</Label>
              <div className="mt-1.5 border rounded-md p-2 min-h-[42px]">
                {/* Selected subjects */}
                {form.subjects.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {form.subjects.map((subId) => {
                      const sub = allSubjects.find((s: any) => (s.id || s._id) === subId);
                      return (
                        <Badge key={subId} variant="secondary" className="gap-1 text-xs h-6 bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {sub?.code || sub?.name || subId}
                          <button
                            type="button"
                            onClick={() => setForm(p => ({ ...p, subjects: p.subjects.filter(id => id !== subId) }))}
                            className="ml-0.5 hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
                {/* Subject picker */}
                <Select
                  value=""
                  onValueChange={(v) => {
                    if (v && !form.subjects.includes(v)) {
                      setForm(p => ({ ...p, subjects: [...p.subjects, v] }));
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs border-dashed">
                    <SelectValue placeholder="+ Add a subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueSubjects
                      .filter((s: any) => !form.subjects.includes(s.id || s._id))
                      .map((s: any) => (
                        <SelectItem key={s.id || s._id} value={s.id || s._id} className="text-xs">
                          <span className="font-mono mr-1.5">{s.code}</span> {s.name}
                        </SelectItem>
                      ))}
                    {uniqueSubjects.filter((s: any) => !form.subjects.includes(s.id || s._id)).length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">No more subjects available</div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Select subjects this teacher can teach. Used in timetable & assignments.</p>
            </div>
            <div className="col-span-2">
              {!editingTeacher && (
                <div className="border-t pt-3 mt-1">
                  <p className="text-sm font-medium text-muted-foreground mb-2">Portal Password</p>
                  <Input
                    type="password"
                    value={form.portalPassword}
                    onChange={(e) => setForm(p => ({...p, portalPassword: e.target.value}))}
                    placeholder="Leave blank to use phone number as password"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Minimum 6 characters. Defaults to last 6 digits of phone if left blank.</p>
                </div>
              )}
              <div className="border-t pt-3 mt-1">
                <p className="text-sm font-medium text-muted-foreground mb-2">Salary Info</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Basic Salary (PKR)</Label>
                    <Input type="number" min="0" value={form.salary.basicSalary || ''} onChange={(e) => setForm(p => ({ ...p, salary: { ...p.salary, basicSalary: Number(e.target.value) } }))} placeholder="e.g. 30000" />
                  </div>
                  <div>
                    <Label>Monthly Allowances (PKR)</Label>
                    <Input type="number" min="0" value={form.salary.allowances || ''} onChange={(e) => setForm(p => ({ ...p, salary: { ...p.salary, allowances: Number(e.target.value) } }))} placeholder="e.g. 5000" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.firstName || !form.email}>{editingTeacher ? 'Save Changes' : 'Add Teacher'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
