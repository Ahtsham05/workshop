import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronRight, Users, Star, BookOpen, Search } from 'lucide-react';
import { useGetClassOverviewQuery } from '@/stores/school.api';

interface SubjectEntry {
  assignmentId: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
}

interface SectionEntry {
  sectionId: string;
  sectionName: string;
  classTeacher: { teacherId: string; name: string; employeeId?: string } | null;
  subjects: SubjectEntry[];
}

interface ClassEntry {
  classId: string;
  className: string;
  sections: SectionEntry[];
}

export default function ClassOverviewPage() {
  const { data: overview = [], isLoading } = useGetClassOverviewQuery(undefined);
  const classes = overview as ClassEntry[];

  const [search, setSearch] = useState('');
  const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({});

  const toggleClass = (classId: string) => {
    setExpandedClasses((prev) => ({ ...prev, [classId]: !prev[classId] }));
  };

  const filtered = search.trim()
    ? classes.filter(
        (c) =>
          c.className.toLowerCase().includes(search.toLowerCase()) ||
          c.sections.some(
            (s) =>
              s.classTeacher?.name.toLowerCase().includes(search.toLowerCase()) ||
              s.subjects.some((sub) => sub.teacherName.toLowerCase().includes(search.toLowerCase()))
          )
      )
    : classes;

  const totalSections = classes.reduce((acc, c) => acc + c.sections.length, 0);
  const totalClassTeachers = classes.reduce(
    (acc, c) => acc + c.sections.filter((s) => s.classTeacher).length,
    0
  );
  const totalSubjectAssignments = classes.reduce(
    (acc, c) => acc + c.sections.reduce((sacc, s) => sacc + s.subjects.length, 0),
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Class Overview</h1>
        <p className="text-muted-foreground text-sm mt-1">
          View class teachers and subject assignments per section
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <BookOpen className="h-7 w-7 text-blue-500" />
            <div>
              <p className="text-xs text-muted-foreground">Classes</p>
              <p className="text-xl font-bold">{classes.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-7 w-7 text-indigo-500" />
            <div>
              <p className="text-xs text-muted-foreground">Sections</p>
              <p className="text-xl font-bold">{totalSections}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Star className="h-7 w-7 text-yellow-500" />
            <div>
              <p className="text-xs text-muted-foreground">Class Teachers</p>
              <p className="text-xl font-bold">{totalClassTeachers}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <BookOpen className="h-7 w-7 text-green-500" />
            <div>
              <p className="text-xs text-muted-foreground">Subject Assignments</p>
              <p className="text-xl font-bold">{totalSubjectAssignments}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search class or teacher..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Class cards */}
      {isLoading ? (
        <p className="text-center py-12 text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground">
          {search ? 'No results found.' : 'No class assignments found. Add assignments from Teacher Assignments.'}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((cls) => {
            const isExpanded = expandedClasses[cls.classId] !== false; // default expanded
            return (
              <Card key={cls.classId} className="overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                  onClick={() => toggleClass(cls.classId)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-semibold text-base">{cls.className}</span>
                  <Badge variant="outline" className="ml-auto">
                    {cls.sections.length} section{cls.sections.length !== 1 ? 's' : ''}
                  </Badge>
                </button>

                {isExpanded && (
                  <CardContent className="pt-0 pb-4 px-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {cls.sections.map((sec) => (
                        <Card key={sec.sectionId} className="border bg-muted/20">
                          <CardHeader className="pb-2 pt-3 px-3">
                            <CardTitle className="text-sm flex items-center justify-between">
                              <span>Section {sec.sectionName}</span>
                              {sec.classTeacher ? (
                                <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-xs">
                                  <Star className="h-3 w-3 mr-1" />
                                  {sec.classTeacher.name}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs text-muted-foreground">
                                  No class teacher
                                </Badge>
                              )}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="px-3 pb-3">
                            {sec.subjects.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No subject assignments</p>
                            ) : (
                              <ul className="space-y-1">
                                {sec.subjects.map((sub) => (
                                  <li key={sub.assignmentId} className="flex items-center justify-between text-xs">
                                    <span className="font-medium">{sub.subjectName}</span>
                                    <span className="text-muted-foreground truncate max-w-[120px] text-right">
                                      {sub.teacherName}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
