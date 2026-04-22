import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGetSchoolClassesQuery, useGetSectionsQuery } from '@/stores/school.api';

interface ClassSelectorProps {
  classId: string;
  sectionId: string;
  onClassChange: (classId: string) => void;
  onSectionChange: (sectionId: string) => void;
  disabled?: boolean;
}

/**
 * Class + Section dropdown pair.
 *
 * When the class changes, `onSectionChange` is immediately reset to ''
 * so the parent never holds a stale sectionId from a previous class.
 *
 * Section dropdown is disabled and shows "All Sections" placeholder when
 * no classId is selected, or when the selected class has no sections.
 */
export function ClassSelector({
  classId,
  sectionId,
  onClassChange,
  onSectionChange,
  disabled = false,
}: ClassSelectorProps) {
  const { data: classesData, isLoading: classesLoading } = useGetSchoolClassesQuery({
    limit: 200,
    sortBy: 'order:asc',
  });

  const { data: sectionsData } = useGetSectionsQuery(
    { classId, limit: 100 },
    { skip: !classId },
  );

  const sections = sectionsData?.results ?? [];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Class selector */}
      <Select
        value={classId}
        onValueChange={(v) => {
          onClassChange(v);
          onSectionChange('');
        }}
        disabled={disabled || classesLoading}
      >
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Select Class" />
        </SelectTrigger>
        <SelectContent>
          {classesData?.results?.map((c: any) => (
            <SelectItem key={c.id ?? c._id} value={c.id ?? c._id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Section selector */}
      <Select
        value={sectionId || '__all__'}
        onValueChange={(v) => onSectionChange(v === '__all__' ? '' : v)}
        disabled={disabled || !classId || sections.length === 0}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="All Sections" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Sections</SelectItem>
          {sections.map((s: any) => (
            <SelectItem key={s.id ?? s._id} value={s.id ?? s._id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
