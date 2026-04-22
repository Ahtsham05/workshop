import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Printer, Pencil, X, Camera, Loader2, GraduationCap, Users, CreditCard } from 'lucide-react';
import StudentAvatar from '../components/student-avatar';
import { useNavigate } from '@tanstack/react-router';
import { useGetStudentQuery, useGetStudentFeesQuery, useUpdateStudentMutation, useGetSchoolClassesQuery, useGetAllSectionsQuery } from '@/stores/school.api';
import { useState, useRef, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import AdmissionFormPrint from './admission-form-print';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

interface Props { id: string; defaultEdit?: boolean; }

export default function StudentProfile({ id, defaultEdit = false }: Props) {
  const navigate = useNavigate();
  const { data: student, isLoading } = useGetStudentQuery(id);
  const { data: fees } = useGetStudentFeesQuery(id);
  const [updateStudent, { isLoading: isUpdating }] = useUpdateStudentMutation();
  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100 });
  const { data: allSectionsData } = useGetAllSectionsQuery({});
  const [printOpen, setPrintOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(defaultEdit);
  const [formInitialized, setFormInitialized] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    firstName: '', lastName: '', gender: '', dateOfBirth: '',
    classId: '', sectionId: '', bloodGroup: '', nationality: '',
    religion: '', previousSchool: '', status: '',
  });
  const [parentForm, setParentForm] = useState({
    fatherName: '', motherName: '', guardianName: '', phone: '',
    email: '', cnic: '', occupation: '', address: '',
  });
  const [feeForm, setFeeForm] = useState({
    monthlyFee: '', transportFee: '', admissionFee: '', discount: '',
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');

  const populateForm = () => {
    if (!student) return;
    setForm({
      firstName: student.firstName || '',
      lastName: student.lastName || '',
      gender: student.gender || '',
      dateOfBirth: student.dateOfBirth ? new Date(student.dateOfBirth).toISOString().split('T')[0] : '',
      classId: student.classId?._id || student.classId?.id || student.classId || '',
      sectionId: student.sectionId?._id || student.sectionId?.id || student.sectionId || '',
      bloodGroup: student.bloodGroup || '',
      nationality: student.nationality || '',
      religion: student.religion || '',
      previousSchool: student.previousSchool || '',
      status: student.status || 'active',
    });
    setParentForm({
      fatherName: student.parent?.fatherName || '',
      motherName: student.parent?.motherName || '',
      guardianName: student.parent?.guardianName || '',
      phone: student.parent?.phone || '',
      email: student.parent?.email || '',
      cnic: student.parent?.cnic || '',
      occupation: student.parent?.occupation || '',
      address: student.parent?.address || '',
    });
    setFeeForm({
      monthlyFee: student.feeStructure?.monthlyFee?.toString() || '',
      transportFee: student.feeStructure?.transportFee?.toString() || '',
      admissionFee: student.feeStructure?.admissionFee?.toString() || '',
      discount: student.feeStructure?.discount?.toString() || '',
    });
    setPhotoPreview(student.photoUrl?.url || '');
    setPhoto(null);
  };

  const startEditing = () => {
    populateForm();
    setIsEditing(true);
  };

  // Auto-populate form when opening in edit mode via defaultEdit
  // Wait for student + dropdown data so Radix Select can match the value to an option
  useEffect(() => {
    if (isEditing && student && classesData && allSectionsData && !formInitialized) {
      populateForm();
      setFormInitialized(true);
    }
  }, [isEditing, student, classesData, allSectionsData, formInitialized]);

  const cancelEditing = () => {
    setIsEditing(false);
    setPhoto(null);
    setPhotoPreview(student?.photoUrl?.url || '');
  };

  const filteredSections = useMemo(() => {
    if (!form.classId || !allSectionsData?.results) return [];
    return allSectionsData.results.filter((s: any) => {
      const classRef = s.classId?._id || s.classId?.id || s.classId;
      return classRef === form.classId;
    });
  }, [form.classId, allSectionsData]);

  const updateField = (field: string, value: string) => {
    setForm(prev => {
      const updated = { ...prev, [field]: value };
      if (field === 'classId') updated.sectionId = '';
      return updated;
    });
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { toast.error('Photo must be less than 5MB'); return; }
      const reader = new FileReader();
      reader.onload = () => { setPhoto(file); setPhotoPreview(reader.result as string); };
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = () => {
    setPhoto(null);
    setPhotoPreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!form.firstName || !form.gender || !form.classId) {
      toast.error('First Name, Gender, and Class are required');
      return;
    }
    try {
      const formData = new FormData();
      formData.append('firstName', form.firstName);
      formData.append('lastName', form.lastName);
      formData.append('gender', form.gender);
      if (form.dateOfBirth) formData.append('dateOfBirth', form.dateOfBirth);
      formData.append('classId', form.classId);
      if (form.sectionId) formData.append('sectionId', form.sectionId);
      if (form.bloodGroup) formData.append('bloodGroup', form.bloodGroup);
      if (form.nationality) formData.append('nationality', form.nationality);
      if (form.religion) formData.append('religion', form.religion);
      if (form.previousSchool) formData.append('previousSchool', form.previousSchool);
      formData.append('status', form.status);
      formData.append('parent', JSON.stringify(parentForm));
      const fee: any = {};
      if (feeForm.monthlyFee) fee.monthlyFee = Number(feeForm.monthlyFee);
      if (feeForm.transportFee) fee.transportFee = Number(feeForm.transportFee);
      if (feeForm.admissionFee) fee.admissionFee = Number(feeForm.admissionFee);
      if (feeForm.discount) fee.discount = Number(feeForm.discount);
      if (Object.keys(fee).length > 0) formData.append('feeStructure', JSON.stringify(fee));
      if (photo) formData.append('photo', photo);

      await updateStudent({ id, formData }).unwrap();
      toast.success('Student updated successfully');
      setIsEditing(false);
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to update student');
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-64">Loading...</div>;
  if (!student) return <div className="text-center py-8">Student not found</div>;

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700', inactive: 'bg-gray-100 text-gray-700',
    graduated: 'bg-blue-100 text-blue-700', transferred: 'bg-orange-100 text-orange-700',
  };

  /* ───── EDIT MODE ───── */
  if (isEditing) {
    return (
      <div className="h-full w-full p-4 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={cancelEditing}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight">Edit Student</h1>
            <p className="text-muted-foreground">{student.admissionNumber} &mdash; {student.firstName} {student.lastName}</p>
          </div>
        </div>

        {/* Student Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><GraduationCap className="h-5 w-5" />Student Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Photo */}
            <div className="flex items-center gap-6">
              <div className="relative">
                {photoPreview ? (
                  <div className="relative">
                    <img src={photoPreview} alt="Preview" className="h-24 w-24 rounded-full object-cover border-2 border-primary" />
                    <button onClick={removePhoto} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => fileInputRef.current?.click()} className="h-24 w-24 rounded-full border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 hover:border-primary transition-colors">
                    <Camera className="h-6 w-6 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">Photo</span>
                  </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
              </div>
              <div className="flex-1 text-sm text-muted-foreground">
                <p>Update student photo (optional)</p>
                <p>Max 5MB — JPG, PNG</p>
              </div>
            </div>

            <Separator />

            {/* Core Fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label>First Name <span className="text-destructive">*</span></Label><Input value={form.firstName} onChange={(e) => updateField('firstName', e.target.value)} /></div>
              <div><Label>Last Name</Label><Input value={form.lastName} onChange={(e) => updateField('lastName', e.target.value)} /></div>
              <div>
                <Label>Gender <span className="text-destructive">*</span></Label>
                <Select value={form.gender} onValueChange={(v) => updateField('gender', v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label>Date of Birth</Label><Input type="date" value={form.dateOfBirth} onChange={(e) => updateField('dateOfBirth', e.target.value)} /></div>
              <div>
                <Label>Class <span className="text-destructive">*</span></Label>
                <Select value={form.classId} onValueChange={(v) => updateField('classId', v)}>
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>{classesData?.results?.map((c: any) => <SelectItem key={c.id || c._id} value={c.id || c._id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Section</Label>
                <Select value={form.sectionId} onValueChange={(v) => updateField('sectionId', v)}>
                  <SelectTrigger><SelectValue placeholder={filteredSections.length ? 'Select' : 'Select class first'} /></SelectTrigger>
                  <SelectContent>{filteredSections.map((s: any) => <SelectItem key={s.id || s._id} value={s.id || s._id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => updateField('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="graduated">Graduated</SelectItem><SelectItem value="transferred">Transferred</SelectItem></SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Optional Fields */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>Blood Group</Label>
                <Select value={form.bloodGroup} onValueChange={(v) => updateField('bloodGroup', v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{BLOOD_GROUPS.map(bg => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Nationality</Label><Input value={form.nationality} onChange={(e) => updateField('nationality', e.target.value)} /></div>
              <div>
                <Label>Religion</Label>
                <Select value={form.religion} onValueChange={(v) => updateField('religion', v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent><SelectItem value="Islam">Islam</SelectItem><SelectItem value="Christianity">Christianity</SelectItem><SelectItem value="Hinduism">Hinduism</SelectItem><SelectItem value="Sikhism">Sikhism</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Previous School</Label><Input value={form.previousSchool} onChange={(e) => updateField('previousSchool', e.target.value)} /></div>
            </div>
          </CardContent>
        </Card>

        {/* Parent / Guardian */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Parent / Guardian Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label>Father Name</Label><Input value={parentForm.fatherName} onChange={(e) => setParentForm(p => ({ ...p, fatherName: e.target.value }))} /></div>
              <div><Label>Mother Name</Label><Input value={parentForm.motherName} onChange={(e) => setParentForm(p => ({ ...p, motherName: e.target.value }))} /></div>
              <div><Label>Guardian Name</Label><Input value={parentForm.guardianName} onChange={(e) => setParentForm(p => ({ ...p, guardianName: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label>Phone</Label><Input type="tel" value={parentForm.phone} onChange={(e) => setParentForm(p => ({ ...p, phone: e.target.value }))} /></div>
              <div><Label>Email</Label><Input type="email" value={parentForm.email} onChange={(e) => setParentForm(p => ({ ...p, email: e.target.value }))} /></div>
              <div><Label>CNIC</Label><Input value={parentForm.cnic} onChange={(e) => setParentForm(p => ({ ...p, cnic: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Occupation</Label><Input value={parentForm.occupation} onChange={(e) => setParentForm(p => ({ ...p, occupation: e.target.value }))} /></div>
              <div><Label>Address</Label><Textarea value={parentForm.address} onChange={(e) => setParentForm(p => ({ ...p, address: e.target.value }))} rows={2} /></div>
            </div>
          </CardContent>
        </Card>

        {/* Fee Structure */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Fee Structure</CardTitle>
            <CardDescription>Update fee details for this student</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><Label>Monthly Fee</Label><Input type="number" min="0" placeholder="0" value={feeForm.monthlyFee} onChange={(e) => setFeeForm(p => ({ ...p, monthlyFee: e.target.value }))} /></div>
              <div><Label>Transport Fee</Label><Input type="number" min="0" placeholder="0" value={feeForm.transportFee} onChange={(e) => setFeeForm(p => ({ ...p, transportFee: e.target.value }))} /></div>
              <div><Label>Admission Fee</Label><Input type="number" min="0" placeholder="0" value={feeForm.admissionFee} onChange={(e) => setFeeForm(p => ({ ...p, admissionFee: e.target.value }))} /></div>
              <div><Label>Discount</Label><Input type="number" min="0" placeholder="0" value={feeForm.discount} onChange={(e) => setFeeForm(p => ({ ...p, discount: e.target.value }))} /></div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-between pb-6">
          <Button variant="outline" onClick={cancelEditing}>Cancel</Button>
          <Button onClick={handleSave} disabled={isUpdating || !form.firstName || !form.gender || !form.classId}>
            {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isUpdating ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    );
  }

  /* ───── VIEW MODE ───── */
  return (
    <div className="h-full w-full p-4 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: '/school/students' as any })}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Student Profile</h1>
          <p className="text-muted-foreground">{student.admissionNumber}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={startEditing}>
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setPrintOpen(true)}>
          <Printer className="h-4 w-4" />
          Print Admission Form
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardContent className="p-6 flex flex-col items-center text-center">
            <StudentAvatar
              photoUrl={student.photoUrl?.url}
              gender={student.gender}
              className="h-32 w-32 rounded-full mb-4"
            />
            <h2 className="text-xl font-bold">{student.firstName} {student.lastName}</h2>
            <p className="text-muted-foreground">Roll: {student.rollNumber || 'N/A'}</p>
            <Badge className={`mt-2 ${statusColors[student.status] || ''}`}>{student.status}</Badge>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Personal Information</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div><span className="text-sm text-muted-foreground">Gender</span><p className="font-medium capitalize">{student.gender}</p></div>
              <div><span className="text-sm text-muted-foreground">Date of Birth</span><p className="font-medium">{new Date(student.dateOfBirth).toLocaleDateString()}</p></div>
              <div><span className="text-sm text-muted-foreground">Class</span><p className="font-medium">{student.classId?.name || '-'}</p></div>
              <div><span className="text-sm text-muted-foreground">Section</span><p className="font-medium">{student.sectionId?.name || '-'}</p></div>
              <div><span className="text-sm text-muted-foreground">Admission Date</span><p className="font-medium">{student.admissionDate ? new Date(student.admissionDate).toLocaleDateString() : '-'}</p></div>
              <div><span className="text-sm text-muted-foreground">Blood Group</span><p className="font-medium">{student.bloodGroup || '-'}</p></div>
              <div><span className="text-sm text-muted-foreground">Nationality</span><p className="font-medium">{student.nationality || '-'}</p></div>
              <div><span className="text-sm text-muted-foreground">Religion</span><p className="font-medium">{student.religion || '-'}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Parent / Guardian</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><span className="text-sm text-muted-foreground">Father</span><p className="font-medium">{student.parent?.fatherName || '-'}</p></div>
            <div><span className="text-sm text-muted-foreground">Mother</span><p className="font-medium">{student.parent?.motherName || '-'}</p></div>
            <div><span className="text-sm text-muted-foreground">Phone</span><p className="font-medium">{student.parent?.phone || '-'}</p></div>
            <div><span className="text-sm text-muted-foreground">Email</span><p className="font-medium">{student.parent?.email || '-'}</p></div>
            <div className="col-span-2 md:col-span-4"><span className="text-sm text-muted-foreground">Address</span><p className="font-medium">{student.parent?.address || '-'}</p></div>
          </div>
        </CardContent>
      </Card>

      {student.feeStructure && (
        <Card>
          <CardHeader><CardTitle>Fee Structure</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><span className="text-sm text-muted-foreground">Monthly Fee</span><p className="font-medium">Rs. {student.feeStructure.monthlyFee || 0}</p></div>
              <div><span className="text-sm text-muted-foreground">Transport Fee</span><p className="font-medium">Rs. {student.feeStructure.transportFee || 0}</p></div>
              <div><span className="text-sm text-muted-foreground">Admission Fee</span><p className="font-medium">Rs. {student.feeStructure.admissionFee || 0}</p></div>
              <div><span className="text-sm text-muted-foreground">Discount</span><p className="font-medium">Rs. {student.feeStructure.discount || 0}</p></div>
            </div>
          </CardContent>
        </Card>
      )}

      {fees && fees.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Fee History</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {fees.map((fee: any) => (
                <div key={fee._id || fee.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium capitalize">{fee.feeType} - {fee.month}/{fee.year}</p>
                    <p className="text-sm text-muted-foreground">Due: {new Date(fee.dueDate).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">Rs. {fee.netAmount}</p>
                    <Badge className={fee.status === 'paid' ? 'bg-green-100 text-green-700' : fee.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}>
                      {fee.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <AdmissionFormPrint studentId={id} open={printOpen} onClose={() => setPrintOpen(false)} />
    </div>
  );
}
