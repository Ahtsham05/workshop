import { useState, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useNavigate } from '@tanstack/react-router';
import { useAdmitStudentMutation, useGetSchoolClassesQuery, useGetAllSectionsQuery, useUpdateVisitorMutation, usePayFeeVoucherMutation } from '@/stores/school.api';
import { toast } from 'sonner';
import { Camera, X, UserPlus, ArrowLeft, ArrowRight, Check, GraduationCap, Users, CreditCard, Printer, Receipt, CheckCircle2, Banknote, Calculator } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

const today = () => new Date().toISOString().split('T')[0];

interface StudentEntry {
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  classId: string;
  sectionId: string;
  bloodGroup: string;
  nationality: string;
  religion: string;
  previousSchool: string;
  monthlyFee: string;
  transportFee: string;
  admissionFee: string;
  discount: string;
  photo: File | null;
  photoPreview: string;
}

const emptyStudent = (): StudentEntry => ({
  firstName: '', lastName: '', gender: '', dateOfBirth: '',
  classId: '', sectionId: '', bloodGroup: '', nationality: 'Pakistani',
  religion: '', previousSchool: '',
  monthlyFee: '', transportFee: '', admissionFee: '', discount: '',
  photo: null, photoPreview: '',
});

export default function StudentForm({ visitorPrefill }: { visitorPrefill?: any }) {
  const navigate = useNavigate();
  const [admitStudent, { isLoading }] = useAdmitStudentMutation();
  const [updateVisitor] = useUpdateVisitorMutation();
  const [payFeeVoucher] = usePayFeeVoucherMutation();
  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100 });
  // Prefetch ALL sections at once — no waiting on class selection
  const { data: allSectionsData } = useGetAllSectionsQuery({});
  const [step, setStep] = useState(1);
  const [prorateFee, setProrateFee] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Admission result state
  const [admissionResult, setAdmissionResult] = useState<any>(null);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', paymentMethod: 'cash' });
  const [isPaying, setIsPaying] = useState(false);
  const [payingVoucherId, setPayingVoucherId] = useState<string | null>(null);
  const PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque', 'online', 'other'];

  // Students array for multi-child admission
  const [students, setStudents] = useState<StudentEntry[]>(() => {
    if (visitorPrefill) {
      return [{
        ...emptyStudent(),
        firstName: visitorPrefill.firstName || '',
        lastName: visitorPrefill.lastName || '',
        gender: visitorPrefill.gender || '',
        dateOfBirth: visitorPrefill.dateOfBirth ? String(visitorPrefill.dateOfBirth).split('T')[0] : '',
        previousSchool: visitorPrefill.previousSchool || '',
      }];
    }
    return [emptyStudent()];
  });
  const [activeStudentIndex, setActiveStudentIndex] = useState(0);

  // Parent info (shared across all children)
  const [parent, setParent] = useState(() => {
    if (visitorPrefill?.parent) {
      return {
        fatherName: visitorPrefill.parent.fatherName || '',
        motherName: '',
        guardianName: '',
        phone: visitorPrefill.parent.phone || '',
        email: visitorPrefill.parent.email || '',
        cnic: '',
        occupation: '',
        address: visitorPrefill.parent.address || '',
      };
    }
    return { fatherName: '', motherName: '', guardianName: '', phone: '', email: '', cnic: '', occupation: '', address: '' };
  });

  const activeStudent = students[activeStudentIndex];

  // Filter sections by selected class — instant, no API call
  const filteredSections = useMemo(() => {
    if (!activeStudent.classId || !allSectionsData?.results) return [];
    return allSectionsData.results.filter((s: any) => {
      const classRef = s.classId?._id || s.classId?.id || s.classId;
      return classRef === activeStudent.classId;
    });
  }, [activeStudent.classId, allSectionsData]);

  const updateStudent = (field: keyof StudentEntry, value: any) => {
    setStudents(prev => {
      const updated = [...prev];
      updated[activeStudentIndex] = { ...updated[activeStudentIndex], [field]: value };
      // Auto-clear section when class changes
      if (field === 'classId') {
        updated[activeStudentIndex].sectionId = '';
      }
      return updated;
    });
  };

  const updateParent = (field: string, value: string) => {
    setParent(prev => ({ ...prev, [field]: value }));
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Photo must be less than 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        updateStudent('photo', file);
        updateStudent('photoPreview', reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = () => {
    updateStudent('photo', null);
    updateStudent('photoPreview', '');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const addAnotherChild = () => {
    setStudents(prev => [...prev, emptyStudent()]);
    setActiveStudentIndex(students.length);
  };

  const removeChild = (index: number) => {
    if (students.length <= 1) return;
    setStudents(prev => prev.filter((_, i) => i !== index));
    setActiveStudentIndex(Math.max(0, activeStudentIndex - 1));
  };

  const canProceedStep1 = activeStudent.firstName && activeStudent.gender && activeStudent.dateOfBirth && activeStudent.classId;
  const canProceedStep2 = parent.fatherName || parent.motherName || parent.guardianName;

  const handleSubmit = async () => {
    try {
      const results: any[] = [];
      for (const student of students) {
        const formData = new FormData();
        formData.append('firstName', student.firstName);
        if (student.lastName) formData.append('lastName', student.lastName);
        formData.append('gender', student.gender);
        formData.append('dateOfBirth', student.dateOfBirth);
        formData.append('classId', student.classId);
        formData.append('admissionDate', today());
        if (student.sectionId) formData.append('sectionId', student.sectionId);
        if (student.bloodGroup) formData.append('bloodGroup', student.bloodGroup);
        if (student.nationality) formData.append('nationality', student.nationality);
        if (student.religion) formData.append('religion', student.religion);
        if (student.previousSchool) formData.append('previousSchool', student.previousSchool);

        // Parent info
        const parentData: any = {};
        if (parent.fatherName) parentData.fatherName = parent.fatherName;
        if (parent.motherName) parentData.motherName = parent.motherName;
        if (parent.phone) parentData.phone = parent.phone;
        if (parent.email) parentData.email = parent.email;
        if (parent.address) parentData.address = parent.address;
        formData.append('parent', JSON.stringify(parentData));

        // Fee structure
        const fee: any = {};
        if (student.monthlyFee) fee.monthlyFee = Number(student.monthlyFee);
        if (student.transportFee) fee.transportFee = Number(student.transportFee);
        if (student.admissionFee) fee.admissionFee = Number(student.admissionFee);
        if (student.discount) fee.discount = Number(student.discount);
        if (Object.keys(fee).length > 0) formData.append('feeStructure', JSON.stringify(fee));
        formData.append('prorateFee', String(prorateFee));

        // Photo
        if (student.photo) formData.append('photo', student.photo);

        const result = await admitStudent(formData).unwrap();
        results.push(result);
      }
      // Mark originating visitor as converted (if came from visitor management)
      if (visitorPrefill?.visitorId) {
        await updateVisitor({ id: visitorPrefill.visitorId, status: 'converted', convertedAt: new Date().toISOString() }).unwrap().catch(() => {});
      }

      // If we got vouchers, show the admission receipt
      const hasVoucher = results.some((r) => r.voucher);
      if (hasVoucher) {
        setAdmissionResult(results);
        setStep(4); // Show admission receipt step
        toast.success('Admission successful! Fee voucher generated.');
      } else {
        toast.success(`${results.length} student${results.length > 1 ? 's' : ''} admitted successfully!`);
        navigate({ to: '/school/students' as any });
      }
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to create student');
    }
  };

  const handlePayVoucher = async (voucherId: string, netAmount: number) => {
    setPayForm({ amount: String(netAmount), paymentMethod: 'cash' });
    setPayingVoucherId(voucherId);
    setPayDialogOpen(true);
  };

  const handleConfirmPayment = async () => {
    if (!payingVoucherId) return;
    setIsPaying(true);
    try {
      await payFeeVoucher({
        id: payingVoucherId,
        amount: Number(payForm.amount),
        paymentMethod: payForm.paymentMethod,
      }).unwrap();
      // Update local state to reflect payment
      setAdmissionResult((prev: any) =>
        prev?.map((r: any) => {
          const vid = r.voucher?.id || r.voucher?._id;
          if (vid === payingVoucherId) {
            const newPaid = (r.voucher.paidAmount || 0) + Number(payForm.amount);
            return {
              ...r,
              voucher: {
                ...r.voucher,
                paidAmount: newPaid,
                status: newPaid >= (r.voucher.netAmount || 0) ? 'paid' : 'partial',
              },
            };
          }
          return r;
        })
      );
      toast.success('Payment received successfully!');
      setPayDialogOpen(false);
      setPayingVoucherId(null);
    } catch (err: any) {
      toast.error(err?.data?.message || 'Payment failed');
    } finally {
      setIsPaying(false);
    }
  };

  const handlePrintVoucher = () => {
    window.print();
  };

  const stepLabels = [
    { label: 'Student Info', icon: <GraduationCap className="h-4 w-4" /> },
    { label: 'Parent / Guardian', icon: <Users className="h-4 w-4" /> },
    { label: 'Fees & Confirm', icon: <CreditCard className="h-4 w-4" /> },
  ];

  return (
    <div className="h-full w-full p-4 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: '/school/students' as any })}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">New Student Admission</h1>
          <p className="text-muted-foreground">Admission Date: {new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
        </div>
        {students.length > 1 && (
          <Badge variant="secondary" className="text-sm">{students.length} Students</Badge>
        )}
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {stepLabels.map((s, i) => (
          <div key={i} className="flex-1">
            <button
              onClick={() => setStep(i + 1)}
              className={`w-full flex items-center gap-2 p-3 rounded-lg text-sm font-medium transition-all ${
                step === i + 1
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : step > i + 1
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              <div className={`flex items-center justify-center h-6 w-6 rounded-full text-xs ${
                step > i + 1 ? 'bg-primary text-primary-foreground' : 'bg-background border'
              }`}>
                {step > i + 1 ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          </div>
        ))}
      </div>

      {/* Multi-child tabs */}
      {students.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          {students.map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <Button
                variant={activeStudentIndex === i ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveStudentIndex(i)}
              >
                {s.firstName || `Student ${i + 1}`}
              </Button>
              {students.length > 1 && (
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeChild(i)}>
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* STEP 1: Student Information */}
      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5" />
                Student Information
              </CardTitle>
              <CardDescription>Only Name, Gender, Date of Birth, and Class are required</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Photo Upload */}
              <div className="flex items-center gap-6">
                <div className="relative">
                  {activeStudent.photoPreview ? (
                    <div className="relative">
                      <img src={activeStudent.photoPreview} alt="Preview" className="h-24 w-24 rounded-full object-cover border-2 border-primary" />
                      <button
                        onClick={removePhoto}
                        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="h-24 w-24 rounded-full border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 hover:border-primary transition-colors"
                    >
                      <Camera className="h-6 w-6 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">Photo</span>
                    </button>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
                </div>
                <div className="flex-1 text-sm text-muted-foreground">
                  <p>Upload student photo (optional)</p>
                  <p>Max 5MB — JPG, PNG</p>
                </div>
              </div>

              <Separator />

              {/* Core Fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>First Name <span className="text-destructive">*</span></Label>
                  <Input placeholder="e.g. Ahmed" value={activeStudent.firstName} onChange={(e) => updateStudent('firstName', e.target.value)} />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input placeholder="e.g. Khan" value={activeStudent.lastName} onChange={(e) => updateStudent('lastName', e.target.value)} />
                </div>
                <div>
                  <Label>Gender <span className="text-destructive">*</span></Label>
                  <Select value={activeStudent.gender} onValueChange={(v) => updateStudent('gender', v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Date of Birth <span className="text-destructive">*</span></Label>
                  <Input type="date" value={activeStudent.dateOfBirth} onChange={(e) => updateStudent('dateOfBirth', e.target.value)} />
                </div>
                <div>
                  <Label>Class <span className="text-destructive">*</span></Label>
                  <Select value={activeStudent.classId} onValueChange={(v) => updateStudent('classId', v)}>
                    <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                    <SelectContent>
                      {classesData?.results?.map((c: any) => (
                        <SelectItem key={c.id || c._id} value={c.id || c._id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Section</Label>
                  <Select value={activeStudent.sectionId} onValueChange={(v) => updateStudent('sectionId', v)}>
                    <SelectTrigger><SelectValue placeholder={filteredSections.length ? 'Select' : 'Select class first'} /></SelectTrigger>
                    <SelectContent>
                      {filteredSections.map((s: any) => (
                        <SelectItem key={s.id || s._id} value={s.id || s._id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Optional Fields */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label>Blood Group</Label>
                  <Select value={activeStudent.bloodGroup} onValueChange={(v) => updateStudent('bloodGroup', v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {BLOOD_GROUPS.map(bg => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Nationality</Label>
                  <Input value={activeStudent.nationality} onChange={(e) => updateStudent('nationality', e.target.value)} />
                </div>
                <div>
                  <Label>Religion</Label>
                  <Select value={activeStudent.religion} onValueChange={(v) => updateStudent('religion', v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Islam">Islam</SelectItem>
                      <SelectItem value="Christianity">Christianity</SelectItem>
                      <SelectItem value="Hinduism">Hinduism</SelectItem>
                      <SelectItem value="Sikhism">Sikhism</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Previous School</Label>
                  <Input placeholder="Optional" value={activeStudent.previousSchool} onChange={(e) => updateStudent('previousSchool', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => navigate({ to: '/school/students' as any })}>Cancel</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={addAnotherChild}>
                <UserPlus className="mr-2 h-4 w-4" /> Add Sibling
              </Button>
              <Button onClick={() => setStep(2)} disabled={!canProceedStep1}>
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Parent / Guardian */}
      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Parent / Guardian Information
              </CardTitle>
              <CardDescription>
                {students.length > 1
                  ? `Shared for all ${students.length} students being admitted`
                  : 'Enter at least father, mother, or guardian name'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Father Name</Label>
                  <Input placeholder="e.g. Muhammad Ali" value={parent.fatherName} onChange={(e) => updateParent('fatherName', e.target.value)} />
                </div>
                <div>
                  <Label>Mother Name</Label>
                  <Input placeholder="e.g. Fatima" value={parent.motherName} onChange={(e) => updateParent('motherName', e.target.value)} />
                </div>
                <div>
                  <Label>Guardian Name</Label>
                  <Input placeholder="If not parent" value={parent.guardianName} onChange={(e) => updateParent('guardianName', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Phone <span className="text-destructive">*</span></Label>
                  <Input type="tel" placeholder="03XX-XXXXXXX" value={parent.phone} onChange={(e) => updateParent('phone', e.target.value)} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" placeholder="Optional" value={parent.email} onChange={(e) => updateParent('email', e.target.value)} />
                </div>
                <div>
                  <Label>CNIC</Label>
                  <Input placeholder="XXXXX-XXXXXXX-X" value={parent.cnic} onChange={(e) => updateParent('cnic', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Occupation</Label>
                  <Input placeholder="Optional" value={parent.occupation} onChange={(e) => updateParent('occupation', e.target.value)} />
                </div>
                <div>
                  <Label>Address</Label>
                  <Textarea placeholder="Home address" value={parent.address} onChange={(e) => updateParent('address', e.target.value)} rows={2} />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button onClick={() => setStep(3)} disabled={!canProceedStep2}>
              Next <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: Fees & Review */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Fee structure per student */}
          {students.map((student, index) => (
            <Card key={index}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Fee Structure {students.length > 1 ? `— ${student.firstName || `Student ${index + 1}`}` : ''}
                </CardTitle>
                <CardDescription>Leave blank for no fee. Fees can be updated later.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label>Monthly Fee</Label>
                    <Input
                      type="number" min="0" placeholder="0"
                      value={student.monthlyFee}
                      onChange={(e) => {
                        setStudents(prev => {
                          const updated = [...prev];
                          updated[index] = { ...updated[index], monthlyFee: e.target.value };
                          return updated;
                        });
                      }}
                    />
                  </div>
                  <div>
                    <Label>Transport Fee</Label>
                    <Input
                      type="number" min="0" placeholder="0"
                      value={student.transportFee}
                      onChange={(e) => {
                        setStudents(prev => {
                          const updated = [...prev];
                          updated[index] = { ...updated[index], transportFee: e.target.value };
                          return updated;
                        });
                      }}
                    />
                  </div>
                  <div>
                    <Label>Admission Fee</Label>
                    <Input
                      type="number" min="0" placeholder="0"
                      value={student.admissionFee}
                      onChange={(e) => {
                        setStudents(prev => {
                          const updated = [...prev];
                          updated[index] = { ...updated[index], admissionFee: e.target.value };
                          return updated;
                        });
                      }}
                    />
                  </div>
                  <div>
                    <Label>Discount</Label>
                    <Input
                      type="number" min="0" placeholder="0"
                      value={student.discount}
                      onChange={(e) => {
                        setStudents(prev => {
                          const updated = [...prev];
                          updated[index] = { ...updated[index], discount: e.target.value };
                          return updated;
                        });
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Summary */}
          {/* Proration toggle */}
          {students.some(s => Number(s.monthlyFee) > 0) && (() => {
            const admDate = new Date();
            const totalDays = new Date(admDate.getFullYear(), admDate.getMonth() + 1, 0).getDate();
            const remainingDays = totalDays - admDate.getDate() + 1;
            const dayOfMonth = admDate.getDate();
            return (
              <Card className={prorateFee ? 'border-blue-200 bg-blue-50/50' : ''}>
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="prorate-fee"
                      checked={prorateFee}
                      onCheckedChange={(v) => setProrateFee(Boolean(v))}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <label htmlFor="prorate-fee" className="font-medium text-sm cursor-pointer flex items-center gap-1.5">
                        <Calculator className="h-4 w-4 text-blue-600" />
                        Prorate monthly fee for mid-month admission
                      </label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Today is <strong>{admDate.toLocaleDateString('en-PK', { day: 'numeric', month: 'long' })}</strong> (day {dayOfMonth} of {totalDays}).
                        {dayOfMonth > 1
                          ? ` Remaining days: ${remainingDays}/${totalDays}`
                          : ' Admitted on the 1st — full monthly fee applies.'}
                      </p>
                      {prorateFee && dayOfMonth > 1 && (
                        <div className="mt-2 space-y-1">
                          {students.map((s, i) => {
                            const mf = Number(s.monthlyFee) || 0;
                            if (!mf) return null;
                            const prorated = Math.ceil((remainingDays / totalDays) * mf);
                            const saved = mf - prorated;
                            return (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                <span className="text-muted-foreground">{s.firstName || `Student ${i+1}`}:</span>
                                <span className="line-through text-muted-foreground">Rs. {mf.toLocaleString()}</span>
                                <span className="font-semibold text-blue-700">→ Rs. {prorated.toLocaleString()}</span>
                                <span className="text-emerald-600">(save Rs. {saved.toLocaleString()})</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Summary */}
          <Card>
            <CardHeader><CardTitle>Admission Summary</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {students.map((student, i) => {
                  const cls = classesData?.results?.find((c: any) => (c.id || c._id) === student.classId);
                  const secs = allSectionsData?.results?.filter((s: any) => {
                    const classRef = s.classId?._id || s.classId?.id || s.classId;
                    return classRef === student.classId;
                  }) || [];
                  const sec = secs.find((s: any) => (s.id || s._id) === student.sectionId);
                  return (
                    <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-muted">
                      {student.photoPreview ? (
                        <img src={student.photoPreview} alt="" className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <GraduationCap className="h-5 w-5 text-primary" />
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="font-medium">{student.firstName} {student.lastName}</p>
                        <p className="text-sm text-muted-foreground">
                          {cls?.name || 'N/A'}{sec ? ` — Section ${sec.name}` : ''} · {student.gender}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p>Monthly: Rs. {student.monthlyFee || '0'}</p>
                      </div>
                    </div>
                  );
                })}
                <Separator />
                <div className="flex items-center gap-4 p-3 rounded-lg bg-muted">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{parent.fatherName || parent.guardianName || 'Parent'}</p>
                    <p className="text-sm text-muted-foreground">{parent.phone} {parent.email ? `· ${parent.email}` : ''}</p>
                  </div>
                </div>
              </div>
              <div className="mt-4 p-3 rounded-lg bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 text-sm">
                Admission Number & Roll Number will be auto-generated
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading} size="lg">
              {isLoading ? 'Processing...' : `Admit ${students.length > 1 ? `${students.length} Students` : 'Student'}`}
              {!isLoading && <Check className="ml-2 h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4: Admission Receipt & Voucher */}
      {step === 4 && admissionResult && (
        <div className="space-y-4">
          <div className="text-center py-4">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-3">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-green-700">Admission Successful!</h2>
            <p className="text-muted-foreground">Student{admissionResult.length > 1 ? 's' : ''} admitted and fee voucher{admissionResult.length > 1 ? 's' : ''} generated</p>
          </div>

          {admissionResult.map((result: any, idx: number) => {
            const s = result.student;
            const v = result.voucher;
            const remaining = v ? Math.max(0, (v.netAmount || 0) - (v.paidAmount || 0)) : 0;
            const isPaid = v?.status === 'paid';

            return (
              <Card key={idx} className="print:border print:shadow-none" id={`voucher-${idx}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Receipt className="h-5 w-5" />
                      Admission Fee Voucher
                    </CardTitle>
                    {v?.voucherNumber && (
                      <Badge variant="outline" className="text-sm font-mono">{v.voucherNumber}</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Student Info */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Student Name</p>
                      <p className="font-medium">{s?.firstName} {s?.lastName}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Admission #</p>
                      <p className="font-medium">{s?.admissionNumber}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Roll #</p>
                      <p className="font-medium">{s?.rollNumber}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Class</p>
                      <p className="font-medium">{s?.classId?.name || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Father Name</p>
                      <p className="font-medium">{s?.parent?.fatherName || '-'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Phone</p>
                      <p className="font-medium">{s?.parent?.phone || '-'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Month</p>
                      <p className="font-medium">{v?.month} {v?.year}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Due Date</p>
                      <p className="font-medium">{v?.dueDate ? new Date(v.dueDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</p>
                    </div>
                  </div>

                  <Separator />

                  {/* Fee Items */}
                  {v?.feeItems && v.feeItems.length > 0 && (
                    <div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left py-2 font-medium">#</th>
                            <th className="text-left py-2 font-medium">Fee Item</th>
                            <th className="text-right py-2 font-medium">Amount (Rs.)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {v.feeItems.map((item: any, i: number) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="py-2">{i + 1}</td>
                              <td className="py-2">{item.name}</td>
                              <td className="py-2 text-right font-medium">{(item.amount || 0).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t">
                            <td colSpan={2} className="py-2 text-right font-medium">Subtotal</td>
                            <td className="py-2 text-right font-medium">
                              Rs. {(v.totalAmount || 0).toLocaleString()}
                            </td>
                          </tr>
                          {(v.discount || 0) > 0 && (
                            <tr className="text-green-600">
                              <td colSpan={2} className="py-1 text-right">Discount</td>
                              <td className="py-1 text-right">- Rs. {(v.discount || 0).toLocaleString()}</td>
                            </tr>
                          )}
                          {(v.fine || 0) > 0 && (
                            <tr className="text-red-600">
                              <td colSpan={2} className="py-1 text-right">Fine</td>
                              <td className="py-1 text-right">+ Rs. {(v.fine || 0).toLocaleString()}</td>
                            </tr>
                          )}
                          <tr className="border-t-2 text-base">
                            <td colSpan={2} className="py-2 text-right font-bold">Net Amount</td>
                            <td className="py-2 text-right font-bold text-primary">
                              Rs. {(v.netAmount || 0).toLocaleString()}
                            </td>
                          </tr>
                          {(v.paidAmount || 0) > 0 && (
                            <tr className="text-green-600">
                              <td colSpan={2} className="py-1 text-right font-medium">Paid</td>
                              <td className="py-1 text-right font-medium">Rs. {(v.paidAmount || 0).toLocaleString()}</td>
                            </tr>
                          )}
                          {remaining > 0 && (
                            <tr className="text-orange-600">
                              <td colSpan={2} className="py-1 text-right font-medium">Remaining</td>
                              <td className="py-1 text-right font-medium">Rs. {remaining.toLocaleString()}</td>
                            </tr>
                          )}
                        </tfoot>
                      </table>
                    </div>
                  )}

                  {/* Status & Actions */}
                  <div className="flex items-center justify-between pt-2">
                    <Badge className={isPaid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>
                      {isPaid ? 'PAID' : v?.status === 'partial' ? 'PARTIALLY PAID' : 'UNPAID'}
                    </Badge>
                    <div className="flex gap-2 print:hidden">
                      {!isPaid && remaining > 0 && (
                        <Button
                          onClick={() => handlePayVoucher(v.id || v._id, remaining)}
                          className="gap-1"
                        >
                          <Banknote className="h-4 w-4" /> Receive Payment
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <div className="flex justify-between print:hidden">
            <Button variant="outline" onClick={() => navigate({ to: '/school/students' as any })}>
              Go to Students
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handlePrintVoucher} className="gap-1">
                <Printer className="h-4 w-4" /> Print Voucher
              </Button>
              <Button onClick={() => navigate({ to: '/school/fees/vouchers' as any })} variant="outline">
                View All Vouchers
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receive Fee Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Payment Amount (Rs.) <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                min={1}
                value={payForm.amount}
                onChange={(e) => setPayForm(p => ({ ...p, amount: e.target.value }))}
              />
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={payForm.paymentMethod} onValueChange={(v) => setPayForm(p => ({ ...p, paymentMethod: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleConfirmPayment} disabled={!payForm.amount || isPaying} className="gap-1">
              <Banknote className="h-4 w-4" />
              {isPaying ? 'Processing...' : 'Confirm Payment'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
