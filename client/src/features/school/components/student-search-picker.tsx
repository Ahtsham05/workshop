import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ChevronsUpDown, Check } from 'lucide-react';
import { useGetStudentsQuery, useGetSchoolClassesQuery } from '@/stores/school.api';
import StudentAvatar from './student-avatar';

interface StudentSearchPickerProps {
  value: string;
  onChange: (studentId: string) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
}

export default function StudentSearchPicker({
  value,
  onChange,
  disabled = false,
  label = 'Student',
  placeholder = 'Search student…',
  className,
}: StudentSearchPickerProps) {
  const [open, setOpen] = useState(false);
  const [classFilter, setClassFilter] = useState('all');

  const { data: studentsData, isLoading, isFetching } = useGetStudentsQuery(
    { limit: 1000, status: 'active' },
    { skip: !open && !value },
  );
  const { data: classesData } = useGetSchoolClassesQuery(
    { limit: 100, sortBy: 'order:asc' },
    { skip: !open },
  );

  const allStudents = studentsData?.results ?? [];
  const classes = classesData?.results ?? [];

  const filteredStudents = useMemo(() => {
    if (classFilter === 'all') return allStudents;
    return allStudents.filter((s: any) => {
      const cId = s.classId?._id || s.classId?.id || s.classId;
      return String(cId) === classFilter;
    });
  }, [allStudents, classFilter]);

  const selectedStudent = allStudents.find((s: any) => (s.id || s._id) === value);
  const selectedLabel = selectedStudent
    ? `${selectedStudent.firstName} ${selectedStudent.lastName || ''} — ${selectedStudent.admissionNumber}`.trim()
    : '';

  const loading = (open || value) && (isLoading || isFetching);
  const triggerLabel = selectedLabel || (loading && !selectedLabel ? 'Loading…' : placeholder);

  return (
    <div className={className}>
      {label && <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            title={triggerLabel}
            className="w-full min-w-0 justify-between gap-2 font-normal h-9 text-sm"
          >
            <span className="truncate text-left">{triggerLabel}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[340px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search by name, admission no…" />
            {classes.length > 1 && (
              <div className="px-2 py-1.5 border-b">
                <Select value={classFilter} onValueChange={setClassFilter}>
                  <SelectTrigger className="h-8 text-xs [&>span]:truncate">
                    <SelectValue placeholder="All Classes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {classes.map((c: any) => (
                      <SelectItem key={c.id || c._id} value={c.id || c._id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <CommandList>
              <CommandEmpty>{loading ? 'Loading students…' : 'No student found.'}</CommandEmpty>
              <CommandGroup>
                {filteredStudents.map((s: any) => {
                  const sid = s.id || s._id;
                  const name = `${s.firstName} ${s.lastName || ''}`.trim();
                  return (
                    <CommandItem
                      key={sid}
                      value={`${name} ${s.admissionNumber} ${s.classId?.name || ''}`}
                      onSelect={() => {
                        onChange(sid);
                        setOpen(false);
                      }}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <StudentAvatar
                          photoUrl={s.photoUrl?.url}
                          gender={s.gender}
                          className="h-6 w-6 rounded-full shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {s.admissionNumber} · {s.classId?.name || ''}
                          </div>
                        </div>
                        {sid === value && <Check className="h-4 w-4 text-blue-600 shrink-0" />}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
