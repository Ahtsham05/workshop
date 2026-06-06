/**
 * Daily Diary management — teachers / admins post the class diary
 * (classwork + homework) that students & parents see in their portal.
 */
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NotebookText, Plus, Trash2, Save, CalendarDays } from 'lucide-react';
import {
  useGetSchoolClassesQuery,
  useGetSectionsQuery,
  useGetSubjectsQuery,
  useGetDiariesQuery,
  useCreateDiaryMutation,
  useDeleteDiaryMutation,
} from '@/stores/school.api';

type DiaryItem = { subjectId: string; classwork: string; homework: string };

const todayStr = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

export default function DiaryManagement() {
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [date, setDate] = useState(todayStr());
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<DiaryItem[]>([{ subjectId: '', classwork: '', homework: '' }]);

  const { data: classesData } = useGetSchoolClassesQuery({ limit: 100, sortBy: 'order:asc' });
  const classes = classesData?.results || [];
  const { data: sectionsData } = useGetSectionsQuery({ classId, limit: 100 }, { skip: !classId });
  const sections = sectionsData?.results || [];
  const { data: subjectsData } = useGetSubjectsQuery({ classId, limit: 100, sortBy: 'name:asc' }, { skip: !classId });
  const subjects = subjectsData?.results || [];

  const { data: diariesData, isFetching } = useGetDiariesQuery(
    { classId, sectionId: sectionId || undefined, limit: 50, sortBy: 'date:desc' },
    { skip: !classId },
  );
  const diaries = diariesData?.results || [];

  const [createDiary, { isLoading: creating }] = useCreateDiaryMutation();
  const [deleteDiary] = useDeleteDiaryMutation();

  const subjectName = useMemo(() => {
    const map: Record<string, string> = {};
    subjects.forEach((s: any) => { map[s.id || s._id] = s.name; });
    return map;
  }, [subjects]);

  const updateItem = (idx: number, patch: Partial<DiaryItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const addItem = () => setItems((prev) => [...prev, { subjectId: '', classwork: '', homework: '' }]);
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const resetForm = () => {
    setTitle('');
    setNote('');
    setItems([{ subjectId: '', classwork: '', homework: '' }]);
  };

  const handleSave = async () => {
    if (!classId) return toast.error('Please select a class');
    if (!date) return toast.error('Please select a date');
    const cleanItems = items
      .filter((it) => it.subjectId || it.classwork.trim() || it.homework.trim())
      .map((it) => ({
        subjectId: it.subjectId || undefined,
        subjectName: it.subjectId ? subjectName[it.subjectId] : undefined,
        classwork: it.classwork.trim(),
        homework: it.homework.trim(),
      }));
    if (cleanItems.length === 0 && !note.trim()) {
      return toast.error('Add at least one subject entry or a note');
    }
    try {
      await createDiary({
        classId,
        sectionId: sectionId || undefined,
        date,
        title: title.trim(),
        note: note.trim(),
        items: cleanItems,
      }).unwrap();
      toast.success('Diary posted');
      resetForm();
    } catch (e: any) {
      toast.error(e?.data?.message || 'Failed to post diary');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDiary(id).unwrap();
      toast.success('Diary deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <NotebookText className="h-6 w-6 text-blue-600" /> Daily Diary
        </h1>
        <p className="text-muted-foreground text-sm">Post classwork and homework for a class. Students and parents see it in their portal.</p>
      </div>

      {/* Composer */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">New Diary Entry</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Class</Label>
              <Select value={classId} onValueChange={(v) => { setClassId(v); setSectionId(''); }}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {classes.map((c: any) => (
                    <SelectItem key={c.id || c._id} value={c.id || c._id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Section <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Select value={sectionId || 'all'} onValueChange={(v) => setSectionId(v === 'all' ? '' : v)} disabled={!classId}>
                <SelectTrigger><SelectValue placeholder="Whole class" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Whole class</SelectItem>
                  {sections.map((s: any) => (
                    <SelectItem key={s.id || s._id} value={s.id || s._id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1">
              <Label>Title <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Today's Diary" />
            </div>
            <div className="space-y-1">
              <Label>General Note <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Announcements, reminders…" rows={2} />
            </div>
          </div>

          {/* Subject items */}
          <div className="space-y-2">
            <Label>Subjects</Label>
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-[180px_1fr_1fr_auto] gap-2 items-start border rounded-lg p-2">
                <Select value={it.subjectId} onValueChange={(v) => updateItem(idx, { subjectId: v })} disabled={!classId}>
                  <SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger>
                  <SelectContent>
                    {subjects.map((s: any) => (
                      <SelectItem key={s.id || s._id} value={s.id || s._id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea value={it.classwork} onChange={(e) => updateItem(idx, { classwork: e.target.value })} placeholder="Classwork" rows={2} />
                <Textarea value={it.homework} onChange={(e) => updateItem(idx, { homework: e.target.value })} placeholder="Homework" rows={2} />
                <Button variant="ghost" size="icon" className="text-red-500" onClick={() => removeItem(idx)} disabled={items.length === 1}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addItem} className="gap-1">
              <Plus className="h-4 w-4" /> Add subject
            </Button>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={creating} className="gap-1">
              <Save className="h-4 w-4" /> {creating ? 'Posting…' : 'Post Diary'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent entries */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Recent Entries</CardTitle></CardHeader>
        <CardContent>
          {!classId ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Select a class to view its diary entries.</p>
          ) : isFetching ? (
            <p className="text-sm text-muted-foreground py-6 text-center animate-pulse">Loading…</p>
          ) : diaries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No diary entries yet for this class.</p>
          ) : (
            <div className="space-y-3">
              {diaries.map((d: any) => (
                <div key={d.id || d._id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <p className="font-semibold text-sm flex items-center gap-1.5">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      {new Date(d.date).toLocaleDateString('en-PK', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}
                      {d.sectionId?.name ? ` · ${d.sectionId.name}` : ''}
                      {d.title ? ` · ${d.title}` : ''}
                    </p>
                    <Button variant="ghost" size="icon" className="text-red-500 h-7 w-7" onClick={() => handleDelete(d.id || d._id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {d.note && <p className="text-sm text-muted-foreground mt-1">{d.note}</p>}
                  {(d.items || []).length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {(d.items || []).map((it: any, i: number) => (
                        <div key={i} className="bg-muted/30 rounded p-2 text-sm">
                          <p className="font-medium">{it.subjectName || subjectName[it.subjectId] || 'Subject'}</p>
                          {it.classwork && <p className="text-xs mt-0.5"><span className="font-semibold text-blue-600">Classwork: </span>{it.classwork}</p>}
                          {it.homework && <p className="text-xs mt-0.5"><span className="font-semibold text-amber-600">Homework: </span>{it.homework}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
