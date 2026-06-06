import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';

const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1';

const baseQueryWithAuth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const baseQuery = fetchBaseQuery({
    baseUrl: baseUrl,
    prepareHeaders: (headers) => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        headers.set('authorization', `Bearer ${token}`);
      }
      const activeBranchId = localStorage.getItem('activeBranchId');
      if (activeBranchId) {
        headers.set('x-branch-id', activeBranchId);
      }
      return headers;
    },
  });

  const result = await baseQuery(args, api, extraOptions);

  if (result.error && result.error.status === 401) {
    console.error('Authentication failed. Please login again.');
  }

  return result;
};

export const schoolApi = createApi({
  reducerPath: 'schoolApi',
  baseQuery: baseQueryWithAuth,
  keepUnusedDataFor: 300, // 5 minutes — cache data after components unmount
  tagTypes: [
    'SchoolClass',
    'Section',
    'Subject',
    'Student',
    'Teacher',
    'SchoolAttendance',
    'TeacherAttendance',
    'TeacherLeave',
    'TeacherPayroll',    'TeacherAssignment',    'Exam',
    'Mark',
    'SchoolFee',
    'Timetable',
    'TimeSlot',
    'SchoolDashboard',
    'Visitor',
    'Diary',
    'Notification',
    'NotificationCount',
    'FeePaymentRequest',
    'SchoolReport',
    // New accounting tags
    'FeeCategory',
    'FeeStructure',
    'FeeVoucher',
    'SchoolTransaction',
    'FeeAccountingDashboard',
    'AccountHead',
    'JournalEntry',
    'BankAccount',
    'Budget',
    'AccountsDashboard',
    'WhatsApp',
  ],
  endpoints: (builder) => ({
    // Dashboard
    getSchoolDashboard: builder.query({
      query: () => '/school-dashboard',
      providesTags: ['SchoolDashboard'],
    }),

    // Classes
    getSchoolClasses: builder.query({
      query: (params) => ({ url: '/school-classes', params }),
      providesTags: ['SchoolClass'],
    }),
    getSchoolClass: builder.query({
      query: (id) => `/school-classes/${id}`,
      providesTags: ['SchoolClass'],
    }),
    createSchoolClass: builder.mutation({
      query: (data) => ({ url: '/school-classes', method: 'POST', body: data }),
      invalidatesTags: ['SchoolClass', 'SchoolDashboard'],
    }),
    updateSchoolClass: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/school-classes/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['SchoolClass'],
    }),
    deleteSchoolClass: builder.mutation({
      query: (id) => ({ url: `/school-classes/${id}`, method: 'DELETE' }),
      invalidatesTags: ['SchoolClass', 'SchoolDashboard'],
    }),

    // Sections
    getSections: builder.query({
      query: (params) => ({ url: '/sections', params }),
      providesTags: ['Section'],
      keepUnusedDataFor: 300, // Cache sections for 5 minutes to avoid repeated calls
    }),
    getAllSections: builder.query({
      query: () => ({ url: '/sections', params: { limit: 500 } }),
      providesTags: ['Section'],
      keepUnusedDataFor: 300,
    }),
    getSection: builder.query({
      query: (id) => `/sections/${id}`,
      providesTags: ['Section'],
    }),
    createSection: builder.mutation({
      query: (data) => ({ url: '/sections', method: 'POST', body: data }),
      invalidatesTags: ['Section'],
    }),
    updateSection: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/sections/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['Section'],
    }),
    deleteSection: builder.mutation({
      query: (id) => ({ url: `/sections/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Section'],
    }),

    // Subjects
    getSubjects: builder.query({
      query: (params) => ({ url: '/subjects', params }),
      providesTags: ['Subject'],
    }),
    getSubject: builder.query({
      query: (id) => `/subjects/${id}`,
      providesTags: ['Subject'],
    }),
    createSubject: builder.mutation({
      query: (data) => ({ url: '/subjects', method: 'POST', body: data }),
      invalidatesTags: ['Subject'],
    }),
    updateSubject: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/subjects/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['Subject'],
    }),
    deleteSubject: builder.mutation({
      query: (id) => ({ url: `/subjects/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Subject'],
    }),

    // Students
    getStudents: builder.query({
      query: (params) => ({ url: '/students', params }),
      providesTags: ['Student'],
    }),
    getStudent: builder.query({
      query: (id) => `/students/${id}`,
      providesTags: ['Student'],
    }),
    getStudentsByClass: builder.query({
      query: (classId) => `/students/class/${classId}`,
      providesTags: ['Student'],
    }),
    createStudent: builder.mutation({
      query: (data) => {
        if (data instanceof FormData) {
          return { url: '/students', method: 'POST', body: data };
        }
        return { url: '/students', method: 'POST', body: data };
      },
      invalidatesTags: ['Student', 'SchoolDashboard'],
    }),
    updateStudent: builder.mutation({
      query: ({ id, formData, ...data }) => {
        // Handle FormData for photo upload
        if (formData instanceof FormData) {
          return { url: `/students/${id}`, method: 'PATCH', body: formData };
        }
        return { url: `/students/${id}`, method: 'PATCH', body: data };
      },
      invalidatesTags: ['Student'],
    }),
    getStudentAdmissionForm: builder.query({
      query: (id) => `/students/${id}/admission-form`,
      providesTags: ['Student'],
    }),
    deleteStudent: builder.mutation({
      query: (id) => ({ url: `/students/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Student', 'SchoolDashboard'],
    }),
    bulkImportStudents: builder.mutation({
      query: (formData: FormData) => ({ url: '/students/import', method: 'POST', body: formData }),
      invalidatesTags: ['Student', 'SchoolDashboard'],
    }),
    admitStudent: builder.mutation({
      query: (data) => {
        if (data instanceof FormData) {
          return { url: '/students/admit', method: 'POST', body: data };
        }
        return { url: '/students/admit', method: 'POST', body: data };
      },
      invalidatesTags: ['Student', 'FeeVoucher', 'SchoolDashboard'],
    }),
    getPromotionEligibility: builder.query({
      query: (classId: string) => `/students/promotion-eligibility/${classId}`,
      providesTags: ['Student', 'FeeVoucher'],
    }),
    promoteStudents: builder.mutation({
      query: (data) => ({ url: '/students/promote', method: 'POST', body: data }),
      invalidatesTags: ['Student', 'SchoolDashboard'],
    }),

    // Teachers
    getTeachers: builder.query({
      query: (params) => ({ url: '/teachers', params }),
      providesTags: ['Teacher'],
    }),
    getTeacher: builder.query({
      query: (id) => `/teachers/${id}`,
      providesTags: ['Teacher'],
    }),
    createTeacher: builder.mutation({
      query: (data) => ({ url: '/teachers', method: 'POST', body: data }),
      invalidatesTags: ['Teacher', 'SchoolDashboard'],
    }),
    updateTeacher: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/teachers/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['Teacher'],
    }),
    deleteTeacher: builder.mutation({
      query: (id) => ({ url: `/teachers/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Teacher', 'SchoolDashboard'],
    }),

    // School Attendance
    getSchoolAttendances: builder.query({
      query: (params) => ({ url: '/school-attendance', params }),
      providesTags: ['SchoolAttendance'],
    }),
    getSchoolAttendance: builder.query({
      query: (id) => `/school-attendance/${id}`,
      providesTags: ['SchoolAttendance'],
    }),
    getAttendanceByClass: builder.query({
      query: ({ classId, date }) => `/school-attendance/class/${classId}?date=${date}`,
      providesTags: ['SchoolAttendance'],
    }),
    markBulkAttendance: builder.mutation({
      query: (data) => ({ url: '/school-attendance/bulk', method: 'POST', body: data }),
      invalidatesTags: ['SchoolAttendance', 'SchoolDashboard'],
    }),
    scanBarcode: builder.mutation({
      query: (data) => ({ url: '/school-attendance/scan', method: 'POST', body: data }),
      invalidatesTags: ['SchoolAttendance', 'SchoolDashboard'],
    }),
    updateSchoolAttendance: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/school-attendance/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['SchoolAttendance'],
    }),
    deleteSchoolAttendance: builder.mutation({
      query: (id) => ({ url: `/school-attendance/${id}`, method: 'DELETE' }),
      invalidatesTags: ['SchoolAttendance'],
    }),

    // Exams
    getExams: builder.query({
      query: (params) => ({ url: '/exams', params }),
      providesTags: ['Exam'],
    }),
    getExam: builder.query({
      query: (id) => `/exams/${id}`,
      providesTags: ['Exam'],
    }),
    createExam: builder.mutation({
      query: (data) => ({ url: '/exams', method: 'POST', body: data }),
      invalidatesTags: ['Exam', 'SchoolDashboard'],
    }),
    updateExam: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/exams/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['Exam'],
    }),
    deleteExam: builder.mutation({
      query: (id) => ({ url: `/exams/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Exam', 'Mark', 'FeeVoucher', 'FeeAccountingDashboard', 'SchoolDashboard'],
    }),
    bulkUpdateExams: builder.mutation({
      query: (data) => ({ url: '/exams/bulk-update', method: 'POST', body: data }),
      invalidatesTags: ['Exam', 'SchoolDashboard'],
    }),
    bulkDeleteExams: builder.mutation({
      query: (data) => ({ url: '/exams/bulk-delete', method: 'POST', body: data }),
      invalidatesTags: ['Exam', 'Mark', 'FeeVoucher', 'FeeAccountingDashboard', 'SchoolDashboard'],
    }),

    // Marks
    getMarks: builder.query({
      query: (params) => ({ url: '/marks', params }),
      providesTags: ['Mark'],
    }),
    getMark: builder.query({
      query: (id) => `/marks/${id}`,
      providesTags: ['Mark'],
    }),
    getMarksByExam: builder.query({
      query: (examId) => `/marks/exam/${examId}`,
      providesTags: ['Mark'],
    }),
    getStudentResult: builder.query({
      query: ({ studentId, examId }) => `/marks/result/${studentId}/${examId}`,
      providesTags: ['Mark'],
    }),
    createMark: builder.mutation({
      query: (data) => ({ url: '/marks', method: 'POST', body: data }),
      invalidatesTags: ['Mark'],
    }),
    createBulkMarks: builder.mutation({
      query: (data) => ({ url: '/marks/bulk', method: 'POST', body: data }),
      invalidatesTags: ['Mark'],
    }),
    updateMark: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/marks/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['Mark'],
    }),
    deleteMark: builder.mutation({
      query: (id) => ({ url: `/marks/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Mark'],
    }),

    // Fees
    getSchoolFees: builder.query({
      query: (params) => ({ url: '/school-fees', params }),
      providesTags: ['SchoolFee'],
    }),
    getSchoolFee: builder.query({
      query: (id) => `/school-fees/${id}`,
      providesTags: ['SchoolFee'],
    }),
    getStudentFees: builder.query({
      query: (studentId) => `/school-fees/student/${studentId}`,
      providesTags: ['SchoolFee'],
    }),
    getOverdueFees: builder.query({
      query: () => '/school-fees/overdue',
      providesTags: ['SchoolFee'],
    }),
    createSchoolFee: builder.mutation({
      query: (data) => ({ url: '/school-fees', method: 'POST', body: data }),
      invalidatesTags: ['SchoolFee', 'SchoolDashboard'],
    }),
    createBulkFees: builder.mutation({
      query: (data) => ({ url: '/school-fees/bulk', method: 'POST', body: data }),
      invalidatesTags: ['SchoolFee', 'SchoolDashboard'],
    }),
    paySchoolFee: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/school-fees/${id}/pay`, method: 'POST', body: data }),
      invalidatesTags: ['SchoolFee', 'SchoolDashboard'],
    }),
    updateSchoolFee: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/school-fees/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['SchoolFee'],
    }),
    deleteSchoolFee: builder.mutation({
      query: (id) => ({ url: `/school-fees/${id}`, method: 'DELETE' }),
      invalidatesTags: ['SchoolFee', 'SchoolDashboard'],
    }),

    // Time Slots
    getActiveTimeSlots: builder.query({
      query: () => '/time-slots/active',
      providesTags: ['TimeSlot'],
      keepUnusedDataFor: 600,
    }),
    getTimeSlots: builder.query({
      query: (params?: Record<string, unknown>) => ({ url: '/time-slots', params }),
      providesTags: ['TimeSlot'],
    }),
    createTimeSlot: builder.mutation({
      query: (data) => ({ url: '/time-slots', method: 'POST', body: data }),
      invalidatesTags: ['TimeSlot'],
    }),
    bulkCreateTimeSlots: builder.mutation({
      query: (data) => ({ url: '/time-slots/bulk', method: 'POST', body: data }),
      invalidatesTags: ['TimeSlot'],
    }),
    deleteTimeSlot: builder.mutation({
      query: (id: string) => ({ url: `/time-slots/${id}`, method: 'DELETE' }),
      invalidatesTags: ['TimeSlot'],
    }),

    // Timetables
    getTimetables: builder.query({
      query: (params) => ({ url: '/timetables', params }),
      providesTags: ['Timetable'],
    }),
    getTimetable: builder.query({
      query: (id) => `/timetables/${id}`,
      providesTags: ['Timetable'],
    }),
    getTimetableByClass: builder.query({
      query: (classId) => `/timetables/class/${classId}`,
      providesTags: ['Timetable'],
    }),
    getTimetableByTeacher: builder.query({
      query: (teacherId: string) => `/timetables/teacher/${teacherId}`,
      providesTags: ['Timetable'],
    }),
    autoGenerateTimetable: builder.mutation({
      query: (data: {
        classId: string;
        sectionId?: string;
        save?: boolean;
        days?: string[];
        shuffle?: boolean;
        /** Time slots produced by the wizard — replaces existing slots before generation */
        timeSlots?: Array<{
          slotNumber: number;
          label: string;
          startTime: string;
          endTime: string;
          type: string;
          applicableDays: string[];
        }>;
      }) => ({
        url: '/timetables/auto-generate',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Timetable'],
    }),
    bulkGenerateTimetables: builder.mutation({
      query: (data?: { continueOnError?: boolean; classIds?: string[] }) => ({
        url: '/timetables/bulk-generate',
        method: 'POST',
        body: data ?? { continueOnError: true },
      }),
      invalidatesTags: ['Timetable'],
    }),
    checkTimetableConflict: builder.mutation({
      query: (data: { classId: string; teacherId: string; day: string; periodNo?: number; timeSlotId?: string }) => ({
        url: '/timetables/check-conflict',
        method: 'POST',
        body: data,
      }),
    }),
    createTimetable: builder.mutation({
      query: (data) => ({ url: '/timetables', method: 'POST', body: data }),
      invalidatesTags: ['Timetable'],
    }),
    updateTimetable: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/timetables/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['Timetable'],
    }),
    deleteTimetable: builder.mutation({
      query: (id) => ({ url: `/timetables/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Timetable'],
    }),
    // Visitors (Admission Inquiries)
    getVisitors: builder.query({
      query: (params) => ({ url: '/visitors', params }),
      providesTags: ['Visitor'],
    }),
    getVisitor: builder.query({
      query: (id) => `/visitors/${id}`,
      providesTags: ['Visitor'],
    }),
    getVisitorStats: builder.query({
      query: () => '/visitors/stats',
      providesTags: ['Visitor'],
    }),
    checkVisitorDuplicate: builder.query({
      query: ({ phone, excludeId }: { phone: string; excludeId?: string }) => ({
        url: '/visitors/check-duplicate',
        params: { phone, excludeId },
      }),
    }),
    createVisitor: builder.mutation({
      query: (data) => ({ url: '/visitors', method: 'POST', body: data }),
      invalidatesTags: ['Visitor'],
    }),
    updateVisitor: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/visitors/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['Visitor'],
    }),
    deleteVisitor: builder.mutation({
      query: (id) => ({ url: `/visitors/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Visitor'],
    }),
    addVisitorFollowUp: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/visitors/${id}/follow-up`, method: 'POST', body: data }),
      invalidatesTags: ['Visitor'],
    }),

    // School Reports
    getStudentProgressReport: builder.query({
      query: ({ studentId, examId }: { studentId: string; examId?: string }) => ({
        url: `/school-reports/student/${studentId}`,
        params: examId ? { examId } : {},
      }),
      providesTags: ['Mark', 'SchoolAttendance', 'SchoolFee'],
    }),
    getClassProgressReportsBulk: builder.query({
      query: ({
        classId,
        examId,
        sectionId,
        studentIds,
      }: {
        classId: string;
        examId: string;
        sectionId?: string;
        studentIds?: string[];
      }) => ({
        url: `/school-reports/class/${classId}/bulk`,
        params: {
          examId,
          ...(sectionId ? { sectionId } : {}),
          ...(studentIds?.length ? { studentIds: studentIds.join(',') } : {}),
        },
      }),
      providesTags: ['Mark', 'SchoolAttendance', 'SchoolFee'],
    }),
    getExamResultSheet: builder.query({
      query: (examId: string) => `/school-reports/exam/${examId}/result-sheet`,
      providesTags: ['Mark', 'Exam'],
    }),

    // Teacher Portal
    getTeacherPortalMe: builder.query({
      query: () => '/teacher-portal/me',
      providesTags: ['Teacher'],
    }),
    getTeacherPortalStudents: builder.query({
      query: () => '/teacher-portal/students',
      providesTags: ['Student'],
    }),
    getTeacherPortalExams: builder.query({
      query: () => '/teacher-portal/exams',
      providesTags: ['Exam'],
    }),
    getTeacherPortalSubjects: builder.query({
      query: () => '/teacher-portal/subjects',
      providesTags: ['Subject'],
    }),
    getTeacherPortalAttendance: builder.query({
      query: (params: { classId?: string; date?: string }) => ({ url: '/teacher-portal/attendance', params }),
      providesTags: ['SchoolAttendance'],
    }),
    getTeacherPortalDashboard: builder.query({
      query: () => '/teacher-portal/dashboard',
      providesTags: ['Teacher', 'Student', 'Exam'],
    }),
    getTeacherPortalTimetable: builder.query({
      query: () => '/teacher-portal/timetable',
      providesTags: ['Timetable'],
    }),
    getTeacherPortalMarks: builder.query({
      query: (params: { examId?: string; classId?: string }) => ({ url: '/teacher-portal/marks', params }),
      providesTags: ['Mark'],
    }),
    getTeacherPortalExamStudents: builder.query({
      query: (params: { examId: string }) => ({
        url: '/teacher-portal/exam-students',
        params,
        cache: 'no-store',
      }),
      transformResponse: (response: unknown) => {
        if (!response || Array.isArray(response)) {
          return { exam: null, students: [], marksMap: {} };
        }
        const r = response as { exam?: unknown; students?: unknown[]; marksMap?: Record<string, unknown> };
        return {
          exam: r.exam ?? null,
          students: Array.isArray(r.students) ? r.students : [],
          marksMap: r.marksMap && typeof r.marksMap === 'object' ? r.marksMap : {},
        };
      },
      providesTags: ['Mark', 'Student'],
    }),
    saveTeacherPortalBulkMarks: builder.mutation({
      query: (body: { marks: any[]; subjectConfig?: { subjectId: string; totalMarks: number; passingMarks: number }[] }) => ({ url: '/teacher-portal/marks/bulk', method: 'POST', body }),
      invalidatesTags: ['Mark'],
    }),
    markTeacherPortalBulkAttendance: builder.mutation({
      query: (body: { records: any[] }) => ({ url: '/teacher-portal/attendance/bulk', method: 'POST', body }),
      invalidatesTags: ['SchoolAttendance'],
    }),
    getTeacherPortalMyAttendance: builder.query({
      query: (params: { from?: string; to?: string }) => ({ url: '/teacher-portal/my-attendance', params }),
      providesTags: ['TeacherAttendance'],
    }),
    getTeacherPortalDiaries: builder.query({
      query: (params: { classId?: string; from?: string; to?: string }) => ({ url: '/teacher-portal/diaries', params }),
      providesTags: ['Diary'],
    }),
    createTeacherPortalDiary: builder.mutation({
      query: (body: any) => ({ url: '/teacher-portal/diaries', method: 'POST', body }),
      invalidatesTags: ['Diary'],
    }),
    deleteTeacherPortalDiary: builder.mutation({
      query: (id: string) => ({ url: `/teacher-portal/diaries/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Diary'],
    }),

    // Notifications
    getMyNotifications: builder.query({
      query: (params?: { limit?: number }) => ({ url: '/notifications', params }),
      providesTags: ['Notification'],
    }),
    getNotificationUnreadCount: builder.query({
      query: () => '/notifications/unread-count',
      providesTags: ['NotificationCount'],
    }),
    markNotificationRead: builder.mutation({
      query: (id: string) => ({ url: `/notifications/${id}/read`, method: 'POST' }),
      invalidatesTags: ['Notification', 'NotificationCount'],
    }),
    markAllNotificationsRead: builder.mutation<{ ok: boolean; marked?: number }, void>({
      query: () => ({ url: '/notifications/read-all', method: 'POST' }),
      invalidatesTags: ['Notification', 'NotificationCount'],
    }),
    sendNotification: builder.mutation({
      query: (body: { title: string; message: string; audience: string[]; type?: string }) => ({
        url: '/notifications',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Notification', 'NotificationCount'],
    }),
    getSentNotifications: builder.query({
      query: (params?: { limit?: number; page?: number }) => ({ url: '/notifications/sent', params }),
      providesTags: ['Notification'],
    }),
    deleteNotification: builder.mutation({
      query: (id: string) => ({ url: `/notifications/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Notification', 'NotificationCount'],
    }),

    // Parent Portal
    getParentPortalChildren: builder.query({
      query: () => '/parent-portal/children',
      providesTags: ['Student'],
    }),
    getParentPortalResults: builder.query({
      query: (params: { studentId?: string; examId?: string }) => ({ url: '/parent-portal/results', params }),
      providesTags: ['Mark'],
    }),
    getParentPortalExams: builder.query({
      query: (params: { studentId?: string }) => ({ url: '/parent-portal/exams', params }),
      providesTags: ['Exam'],
    }),
    getParentPortalDiary: builder.query({
      query: (params: { studentId?: string; from?: string; to?: string }) => ({ url: '/parent-portal/diary', params }),
      providesTags: ['Diary'],
    }),
    getParentPortalBankAccounts: builder.query({
      query: () => '/parent-portal/bank-accounts',
    }),
    getParentPortalPaymentRequests: builder.query({
      query: (params: { studentId?: string }) => ({ url: '/parent-portal/payment-requests', params }),
      providesTags: ['FeePaymentRequest'],
    }),
    createParentPortalPaymentRequest: builder.mutation({
      query: (formData: FormData) => ({ url: '/parent-portal/payment-requests', method: 'POST', body: formData }),
      invalidatesTags: ['FeePaymentRequest', 'SchoolFee'],
    }),
    getParentPortalAttendance: builder.query({
      query: (params: { studentId?: string; from?: string; to?: string }) => ({ url: '/parent-portal/attendance', params }),
      providesTags: ['SchoolAttendance'],
    }),
    getParentPortalFees: builder.query({
      query: (params: { studentId?: string }) => ({ url: '/parent-portal/fees', params }),
      providesTags: ['SchoolFee'],
    }),
    getParentPortalReport: builder.query({
      query: ({ studentId, examId }: { studentId: string; examId?: string }) => ({
        url: `/parent-portal/report/${studentId}`,
        params: examId ? { examId } : {},
      }),
      providesTags: ['Mark', 'SchoolAttendance', 'SchoolFee'],
    }),

    // Fee Payment Requests (admin review)
    getFeePaymentRequests: builder.query({
      query: (params: { status?: string; studentId?: string; limit?: number; page?: number; sortBy?: string }) => ({
        url: '/fee-payment-requests',
        params,
      }),
      providesTags: ['FeePaymentRequest'],
    }),
    getFeePaymentRequestPendingCount: builder.query({
      query: () => '/fee-payment-requests/pending-count',
      providesTags: ['FeePaymentRequest'],
    }),
    approveFeePaymentRequest: builder.mutation({
      query: ({ id, note }: { id: string; note?: string }) => ({ url: `/fee-payment-requests/${id}/approve`, method: 'POST', body: { note } }),
      invalidatesTags: ['FeePaymentRequest', 'SchoolFee', 'FeeVoucher', 'FeeAccountingDashboard'],
    }),
    rejectFeePaymentRequest: builder.mutation({
      query: ({ id, note }: { id: string; note?: string }) => ({ url: `/fee-payment-requests/${id}/reject`, method: 'POST', body: { note } }),
      invalidatesTags: ['FeePaymentRequest'],
    }),

    // Daily Diary (admin / teacher management)
    getDiaries: builder.query({
      query: (params: { classId?: string; sectionId?: string; dateFrom?: string; dateTo?: string; limit?: number; page?: number; sortBy?: string }) => ({
        url: '/diaries',
        params,
      }),
      providesTags: ['Diary'],
    }),
    getDiary: builder.query({
      query: (id: string) => `/diaries/${id}`,
      providesTags: ['Diary'],
    }),
    createDiary: builder.mutation({
      query: (body) => ({ url: '/diaries', method: 'POST', body }),
      invalidatesTags: ['Diary'],
    }),
    updateDiary: builder.mutation({
      query: ({ id, ...body }: { id: string; [k: string]: unknown }) => ({ url: `/diaries/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Diary'],
    }),
    deleteDiary: builder.mutation({
      query: (id: string) => ({ url: `/diaries/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Diary'],
    }),

    // Teacher Attendance
    getTeacherAttendances: builder.query({
      query: (params) => ({ url: '/teacher-attendance', params }),
      providesTags: ['TeacherAttendance'],
    }),
    getTeacherAttendance: builder.query({
      query: (id: string) => `/teacher-attendance/${id}`,
      providesTags: ['TeacherAttendance'],
    }),
    getTeacherAttendanceTodayStats: builder.query({
      query: () => '/teacher-attendance/today-stats',
      providesTags: ['TeacherAttendance'],
    }),
    markTeacherAttendance: builder.mutation({
      query: (data) => ({ url: '/teacher-attendance', method: 'POST', body: data }),
      invalidatesTags: ['TeacherAttendance', 'SchoolDashboard'],
    }),
    markBulkTeacherAttendance: builder.mutation({
      query: (data) => ({ url: '/teacher-attendance/bulk', method: 'POST', body: data }),
      invalidatesTags: ['TeacherAttendance', 'SchoolDashboard'],
    }),
    updateTeacherAttendance: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/teacher-attendance/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['TeacherAttendance'],
    }),
    deleteTeacherAttendance: builder.mutation({
      query: (id: string) => ({ url: `/teacher-attendance/${id}`, method: 'DELETE' }),
      invalidatesTags: ['TeacherAttendance'],
    }),

    // Teacher Leaves
    getTeacherLeaves: builder.query({
      query: (params) => ({ url: '/teacher-leaves', params }),
      providesTags: ['TeacherLeave'],
    }),
    getTeacherLeave: builder.query({
      query: (id: string) => `/teacher-leaves/${id}`,
      providesTags: ['TeacherLeave'],
    }),
    applyTeacherLeave: builder.mutation({
      query: (data) => ({ url: '/teacher-leaves', method: 'POST', body: data }),
      invalidatesTags: ['TeacherLeave'],
    }),
    approveTeacherLeave: builder.mutation({
      query: (id: string) => ({ url: `/teacher-leaves/${id}/approve`, method: 'PATCH' }),
      invalidatesTags: ['TeacherLeave'],
    }),
    rejectTeacherLeave: builder.mutation({
      query: ({ id, rejectionReason }: { id: string; rejectionReason: string }) => ({
        url: `/teacher-leaves/${id}/reject`,
        method: 'PATCH',
        body: { rejectionReason },
      }),
      invalidatesTags: ['TeacherLeave'],
    }),
    cancelTeacherLeave: builder.mutation({
      query: (id: string) => ({ url: `/teacher-leaves/${id}/cancel`, method: 'PATCH' }),
      invalidatesTags: ['TeacherLeave'],
    }),
    deleteTeacherLeave: builder.mutation({
      query: (id: string) => ({ url: `/teacher-leaves/${id}`, method: 'DELETE' }),
      invalidatesTags: ['TeacherLeave'],
    }),

    // Teacher Payroll
    getTeacherPayrolls: builder.query({
      query: (params) => ({ url: '/teacher-payroll', params }),
      providesTags: ['TeacherPayroll'],
    }),
    getTeacherPayroll: builder.query({
      query: (id: string) => `/teacher-payroll/${id}`,
      providesTags: ['TeacherPayroll'],
    }),
    generateTeacherPayroll: builder.mutation({
      query: (data) => ({ url: '/teacher-payroll', method: 'POST', body: data }),
      invalidatesTags: ['TeacherPayroll', 'SchoolDashboard'],
    }),
    markTeacherPayrollPaid: builder.mutation({
      query: (id: string) => ({ url: `/teacher-payroll/${id}/pay`, method: 'PATCH' }),
      invalidatesTags: ['TeacherPayroll', 'SchoolDashboard'],
    }),
    updateTeacherPayroll: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/teacher-payroll/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['TeacherPayroll', 'SchoolDashboard'],
    }),
    deleteTeacherPayroll: builder.mutation({
      query: (id: string) => ({ url: `/teacher-payroll/${id}`, method: 'DELETE' }),
      invalidatesTags: ['TeacherPayroll', 'SchoolDashboard'],
    }),

    // Fee Categories
    getFeeCategories: builder.query({
      query: (params) => ({ url: '/fee-categories', params }),
      providesTags: ['FeeCategory'],
    }),
    getIncomeCategories: builder.query({
      query: () => '/fee-categories/income',
      providesTags: ['FeeCategory'],
    }),
    getExpenseCategories: builder.query({
      query: () => '/fee-categories/expense',
      providesTags: ['FeeCategory'],
    }),
    createFeeCategory: builder.mutation({
      query: (data) => ({ url: '/fee-categories', method: 'POST', body: data }),
      invalidatesTags: ['FeeCategory'],
    }),
    updateFeeCategory: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/fee-categories/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['FeeCategory'],
    }),
    deleteFeeCategory: builder.mutation({
      query: (id) => ({ url: `/fee-categories/${id}`, method: 'DELETE' }),
      invalidatesTags: ['FeeCategory'],
    }),
    seedFeeCategories: builder.mutation({
      query: () => ({ url: '/fee-categories/seed', method: 'POST' }),
      invalidatesTags: ['FeeCategory'],
    }),

    // Fee Structures
    getFeeStructures: builder.query({
      query: (params) => ({ url: '/fee-structures', params }),
      providesTags: ['FeeStructure'],
    }),
    getFeeStructure: builder.query({
      query: (id) => `/fee-structures/${id}`,
      providesTags: ['FeeStructure'],
    }),
    getFeeStructureByClass: builder.query({
      query: (classId) => `/fee-structures/class/${classId}`,
      providesTags: ['FeeStructure'],
    }),
    createFeeStructure: builder.mutation({
      query: (data) => ({ url: '/fee-structures', method: 'POST', body: data }),
      invalidatesTags: ['FeeStructure'],
    }),
    updateFeeStructure: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/fee-structures/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['FeeStructure'],
    }),
    deleteFeeStructure: builder.mutation({
      query: (id) => ({ url: `/fee-structures/${id}`, method: 'DELETE' }),
      invalidatesTags: ['FeeStructure'],
    }),

    // Fee Vouchers
    getFeeVouchers: builder.query({
      query: (params) => ({ url: '/fee-vouchers', params }),
      providesTags: ['FeeVoucher'],
    }),
    getFeeVoucher: builder.query({
      query: (id) => `/fee-vouchers/${id}`,
      providesTags: ['FeeVoucher'],
    }),
    getStudentFeeVouchers: builder.query({
      query: (studentId) => `/fee-vouchers/student/${studentId}`,
      providesTags: ['FeeVoucher'],
    }),
    getStudentFeeSummary: builder.query({
      query: (studentId) => `/fee-vouchers/student/${studentId}/summary`,
      providesTags: ['FeeVoucher'],
    }),
    getStudentFeeLedger: builder.query({
      query: (studentId) => `/fee-vouchers/student/${studentId}/ledger`,
      providesTags: ['FeeVoucher'],
    }),
    getFeeVoucherStats: builder.query({
      query: (params) => ({ url: '/fee-vouchers/stats', params }),
      providesTags: ['FeeVoucher', 'FeeAccountingDashboard'],
    }),
    createFeeVoucher: builder.mutation({
      query: (data) => ({ url: '/fee-vouchers', method: 'POST', body: data }),
      invalidatesTags: ['FeeVoucher', 'FeeAccountingDashboard'],
    }),
    bulkGenerateFeeVouchers: builder.mutation({
      query: (data) => ({ url: '/fee-vouchers/bulk', method: 'POST', body: data }),
      invalidatesTags: ['FeeVoucher', 'FeeAccountingDashboard'],
    }),
    bulkGenerateExamFeeVouchers: builder.mutation({
      query: (data) => ({ url: '/fee-vouchers/bulk-exam', method: 'POST', body: data }),
      invalidatesTags: ['FeeVoucher', 'FeeAccountingDashboard'],
    }),
    payFeeVoucher: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/fee-vouchers/${id}/pay`, method: 'POST', body: data }),
      invalidatesTags: ['FeeVoucher', 'FeeAccountingDashboard', 'SchoolTransaction'],
    }),
    updateFeeVoucher: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/fee-vouchers/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['FeeVoucher'],
    }),
    deleteFeeVoucher: builder.mutation({
      query: (id) => ({ url: `/fee-vouchers/${id}`, method: 'DELETE' }),
      invalidatesTags: ['FeeVoucher', 'FeeAccountingDashboard'],
    }),
    getFeeVouchersForPrint: builder.mutation({
      query: (ids: string[]) => ({ url: '/fee-vouchers/print', method: 'POST', body: { ids } }),
    }),
    reconcileFeeVouchers: builder.mutation({
      query: () => ({ url: '/fee-vouchers/reconcile', method: 'POST' }),
      invalidatesTags: ['FeeVoucher', 'FeeAccountingDashboard'],
    }),
    bulkPayStudentFeeVouchers: builder.mutation({
      query: ({ studentId, ...data }) => ({
        url: `/fee-vouchers/student/${studentId}/pay-all`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['FeeVoucher', 'FeeAccountingDashboard', 'SchoolTransaction'],
    }),
    recordStudentAdvancePayment: builder.mutation({
      query: ({ studentId, ...data }) => ({
        url: `/fee-vouchers/student/${studentId}/advance`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['FeeVoucher', 'FeeAccountingDashboard', 'SchoolTransaction'],
    }),
    getStudentCreditHistory: builder.query({
      query: ({ studentId, ...params }) => ({ url: `/fee-vouchers/student/${studentId}/credit-history`, params }),
      providesTags: ['FeeVoucher'],
    }),
    getStudentBalances: builder.query({
      query: ({ ids, month, year }: { ids: string[]; month?: string; year?: number }) =>
        ({ url: '/fee-vouchers/student-balances', params: { ids: ids.join(','), month, year } }),
      providesTags: ['FeeVoucher'],
    }),
    getReceivableSummary: builder.query({
      query: (params: { month: string; year: number; classId?: string }) => {
        const q: Record<string, string | number> = { month: params.month, year: params.year };
        if (params.classId) q.classId = params.classId;
        return { url: '/school-reports-engine/fee-collection/receivable', params: q };
      },
      providesTags: ['FeeVoucher'],
    }),
    getYearlyFeeReport: builder.query({
      query: (params: { year: number; classId?: string }) =>
        ({ url: '/school-reports-engine/fee-collection/yearly', params }),
      providesTags: ['FeeVoucher'],
    }),

    // School Transactions
    getSchoolTransactions: builder.query({
      query: (params) => ({ url: '/school-transactions', params }),
      providesTags: ['SchoolTransaction'],
    }),
    createSchoolTransaction: builder.mutation({
      query: (data) => ({ url: '/school-transactions', method: 'POST', body: data }),
      invalidatesTags: ['SchoolTransaction', 'FeeAccountingDashboard'],
    }),
    updateSchoolTransaction: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/school-transactions/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['SchoolTransaction', 'FeeAccountingDashboard'],
    }),
    deleteSchoolTransaction: builder.mutation({
      query: (id) => ({ url: `/school-transactions/${id}`, method: 'DELETE' }),
      invalidatesTags: ['SchoolTransaction', 'FeeAccountingDashboard'],
    }),
    getTransactionMonthlySummary: builder.query({
      query: (params) => ({ url: '/school-transactions/summary/monthly', params }),
      providesTags: ['SchoolTransaction'],
    }),
    getTransactionCategoryReport: builder.query({
      query: (params) => ({ url: '/school-transactions/summary/category', params }),
      providesTags: ['SchoolTransaction'],
    }),
    getTransactionYearlyTrend: builder.query({
      query: (params) => ({ url: '/school-transactions/summary/yearly-trend', params }),
      providesTags: ['SchoolTransaction'],
    }),

    // School Accounting Dashboard & Reports
    getSchoolAccountingDashboard: builder.query({
      query: (params) => ({ url: '/school-accounting/dashboard', params }),
      providesTags: ['FeeAccountingDashboard'],
    }),
    getSchoolMonthlyReport: builder.query({
      query: (params) => ({ url: '/school-accounting/reports/monthly', params }),
      providesTags: ['FeeAccountingDashboard', 'SchoolTransaction'],
    }),
    getSchoolCategoryReport: builder.query({
      query: (params) => ({ url: '/school-accounting/reports/categories', params }),
      providesTags: ['FeeAccountingDashboard', 'SchoolTransaction'],
    }),
    getSchoolTeacherSalaryReport: builder.query({
      query: (params) => ({ url: '/school-accounting/reports/teacher-salary', params }),
      providesTags: ['FeeAccountingDashboard', 'SchoolTransaction'],
    }),
    getSchoolStudentFeeReport: builder.query({
      query: ({ studentId, ...params }: { studentId: string; year?: number }) => ({
        url: `/school-accounting/reports/student/${studentId}`,
        params,
      }),
      providesTags: ['FeeVoucher'],
    }),

    // Teacher Assignments
    getTeacherAssignments: builder.query({
      query: (params?: Record<string, unknown>) => ({ url: '/teacher-assignments', params }),
      providesTags: ['TeacherAssignment'],
    }),
    getTeacherAssignment: builder.query({
      query: (id: string) => `/teacher-assignments/${id}`,
      providesTags: ['TeacherAssignment'],
    }),
    getTeacherAssignmentsByTeacher: builder.query({
      query: (teacherId: string) => `/teacher-assignments/teacher/${teacherId}`,
      providesTags: ['TeacherAssignment'],
    }),
    getClassOverview: builder.query({
      query: () => '/teacher-assignments/class-overview',
      providesTags: ['TeacherAssignment', 'SchoolClass', 'Section'],
    }),
    createTeacherAssignment: builder.mutation({
      query: (data) => ({ url: '/teacher-assignments', method: 'POST', body: data }),
      invalidatesTags: ['TeacherAssignment'],
    }),
    deleteTeacherAssignment: builder.mutation({
      query: (id: string) => ({ url: `/teacher-assignments/${id}`, method: 'DELETE' }),
      invalidatesTags: ['TeacherAssignment'],
    }),

    // ═══ School Reports Engine ═══
    getReportEngine: builder.query({
      query: (params: { type: string; year?: number; month?: string; classId?: string; teacherId?: string; startDate?: string; endDate?: string; status?: string }) =>
        ({ url: '/school-reports-engine', params }),
      providesTags: ['FeeAccountingDashboard', 'SchoolTransaction', 'FeeVoucher'],
    }),
    getReportFinancialMonthly: builder.query({
      query: (params: { year: number }) => ({ url: '/school-reports-engine/financial/monthly', params }),
      providesTags: ['SchoolTransaction'],
    }),
    getReportFinancialDaily: builder.query({
      query: (params: { year: number; month: string }) => ({ url: '/school-reports-engine/financial/daily', params }),
      providesTags: ['SchoolTransaction'],
    }),
    getReportFinancialCategories: builder.query({
      query: (params?: { startDate?: string; endDate?: string }) => ({ url: '/school-reports-engine/financial/categories', params }),
      providesTags: ['SchoolTransaction'],
    }),
    getReportFinancialPnl: builder.query({
      query: (params: { year: number }) => ({ url: '/school-reports-engine/financial/pnl', params }),
      providesTags: ['SchoolTransaction', 'FeeVoucher'],
    }),
    getReportStudentList: builder.query({
      query: (params?: { classId?: string }) => ({ url: '/school-reports-engine/students/list', params }),
      providesTags: ['Student'],
    }),
    getReportStudentFeeStatus: builder.query({
      query: (params: { year: number; month: string; classId?: string }) => ({ url: '/school-reports-engine/students/fee-status', params }),
      providesTags: ['FeeVoucher'],
    }),
    getReportStudentAttendance: builder.query({
      query: (params: { year: number; month: string; classId?: string }) => ({ url: '/school-reports-engine/students/attendance', params }),
      providesTags: ['SchoolAttendance'],
    }),
    getReportTeacherSalary: builder.query({
      query: (params: { year: number }) => ({ url: '/school-reports-engine/teachers/salary', params }),
      providesTags: ['TeacherPayroll'],
    }),
    getReportTeacherWorkload: builder.query({
      query: (_params: Record<string, never>) => ({ url: '/school-reports-engine/teachers/workload' }),
      providesTags: ['Timetable'],
    }),
    getReportVouchers: builder.query({
      query: (params: { year: number; month: string; status?: string; classId?: string }) => ({ url: '/school-reports-engine/vouchers', params }),
      providesTags: ['FeeVoucher'],
    }),
    getReportAnalytics: builder.query({
      query: (params: { year: number }) => ({ url: '/school-reports-engine/analytics', params }),
      providesTags: ['SchoolTransaction', 'FeeVoucher'],
    }),

    // ══════════════════════════════════════════════════════════════
    // ─── Accounts System ─────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════

    // Dashboard
    getAccountsDashboard: builder.query({
      query: (params: { year?: number }) => ({ url: '/accounts-system/dashboard', params }),
      providesTags: ['AccountsDashboard', 'JournalEntry', 'BankAccount'],
    }),

    // Chart of Accounts
    getChartOfAccounts: builder.query({
      query: () => '/accounts-system/chart-of-accounts',
      providesTags: ['AccountHead'],
    }),
    getAccountTree: builder.query({
      query: () => '/accounts-system/chart-of-accounts/tree',
      providesTags: ['AccountHead'],
    }),
    getPostingAccounts: builder.query({
      query: (params?: { rootType?: string }) => ({ url: '/accounts-system/chart-of-accounts/posting', params }),
      providesTags: ['AccountHead'],
    }),
    getAccountHeadById: builder.query({
      query: (id: string) => `/accounts-system/chart-of-accounts/${id}`,
      providesTags: ['AccountHead'],
    }),
    seedChartOfAccounts: builder.mutation({
      query: () => ({ url: '/accounts-system/chart-of-accounts/seed', method: 'POST' }),
      invalidatesTags: ['AccountHead', 'BankAccount', 'AccountsDashboard'],
    }),
    createAccountHead: builder.mutation({
      query: (data) => ({ url: '/accounts-system/chart-of-accounts', method: 'POST', body: data }),
      invalidatesTags: ['AccountHead'],
    }),
    updateAccountHead: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/accounts-system/chart-of-accounts/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['AccountHead'],
    }),
    deleteAccountHead: builder.mutation({
      query: (id) => ({ url: `/accounts-system/chart-of-accounts/${id}`, method: 'DELETE' }),
      invalidatesTags: ['AccountHead'],
    }),

    // Journal Entries
    getJournalEntries: builder.query({
      query: (params: { entryType?: string; status?: string; financialYear?: string; accountId?: string; startDate?: string; endDate?: string; page?: number; limit?: number }) => ({ url: '/accounts-system/journal-entries', params }),
      providesTags: ['JournalEntry'],
    }),
    getJournalEntryById: builder.query({
      query: (id: string) => `/accounts-system/journal-entries/${id}`,
      providesTags: ['JournalEntry'],
    }),
    createJournalEntry: builder.mutation({
      query: (data) => ({ url: '/accounts-system/journal-entries', method: 'POST', body: data }),
      invalidatesTags: ['JournalEntry', 'AccountHead', 'AccountsDashboard', 'BankAccount'],
    }),
    reverseJournalEntry: builder.mutation({
      query: (id) => ({ url: `/accounts-system/journal-entries/${id}/reverse`, method: 'POST' }),
      invalidatesTags: ['JournalEntry', 'AccountHead', 'AccountsDashboard'],
    }),

    // Bank Accounts
    getBankAccounts: builder.query({
      query: () => '/accounts-system/bank-accounts',
      providesTags: ['BankAccount'],
    }),
    createBankAccount: builder.mutation({
      query: (data) => ({ url: '/accounts-system/bank-accounts', method: 'POST', body: data }),
      invalidatesTags: ['BankAccount', 'AccountHead', 'AccountsDashboard'],
    }),
    updateBankAccount: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/accounts-system/bank-accounts/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['BankAccount'],
    }),
    deleteBankAccount: builder.mutation({
      query: (id) => ({ url: `/accounts-system/bank-accounts/${id}`, method: 'DELETE' }),
      invalidatesTags: ['BankAccount', 'AccountHead'],
    }),

    // Budgets
    getBudgets: builder.query({
      query: (params?: { financialYear?: string }) => ({ url: '/accounts-system/budgets', params }),
      providesTags: ['Budget'],
    }),
    createBudget: builder.mutation({
      query: (data) => ({ url: '/accounts-system/budgets', method: 'POST', body: data }),
      invalidatesTags: ['Budget'],
    }),
    updateBudget: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/accounts-system/budgets/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['Budget'],
    }),
    deleteBudget: builder.mutation({
      query: (id) => ({ url: `/accounts-system/budgets/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Budget'],
    }),

    // Financial Statements
    getGeneralLedger: builder.query({
      query: (params: { accountId: string; startDate?: string; endDate?: string }) => ({ url: '/accounts-system/statements/general-ledger', params }),
      providesTags: ['JournalEntry'],
    }),
    getTrialBalance: builder.query({
      query: (params?: { startDate?: string; endDate?: string }) => ({ url: '/accounts-system/statements/trial-balance', params }),
      providesTags: ['JournalEntry'],
    }),
    getBalanceSheet: builder.query({
      query: (params?: { asOfDate?: string }) => ({ url: '/accounts-system/statements/balance-sheet', params }),
      providesTags: ['JournalEntry'],
    }),
    getIncomeStatement: builder.query({
      query: (params?: { startDate?: string; endDate?: string }) => ({ url: '/accounts-system/statements/income-statement', params }),
      providesTags: ['JournalEntry'],
    }),
    getCashFlowStatement: builder.query({
      query: (params?: { startDate?: string; endDate?: string }) => ({ url: '/accounts-system/statements/cash-flow', params }),
      providesTags: ['JournalEntry', 'BankAccount'],
    }),
    getBudgetVsActual: builder.query({
      query: (params?: { financialYear?: string }) => ({ url: '/accounts-system/statements/budget-vs-actual', params }),
      providesTags: ['JournalEntry', 'Budget'],
    }),

    // WhatsApp Messaging
    getWhatsAppStatus: builder.query<{ state: string; qrImage: string | null }, void>({
      query: () => ({ url: '/whatsapp/status', headers: { 'Cache-Control': 'no-cache' } }),
      providesTags: ['WhatsApp'],
      keepUnusedDataFor: 0,
    }),
    connectWhatsApp: builder.mutation<{ message: string; state: string }, void>({
      query: () => ({ url: '/whatsapp/connect', method: 'POST' }),
      invalidatesTags: ['WhatsApp'],
    }),
    disconnectWhatsApp: builder.mutation<{ message: string; state: string }, void>({
      query: () => ({ url: '/whatsapp/disconnect', method: 'POST' }),
      invalidatesTags: ['WhatsApp'],
    }),
    clearWhatsAppSession: builder.mutation<{ message: string; state: string }, void>({
      query: () => ({ url: '/whatsapp/clear-session', method: 'POST' }),
      invalidatesTags: ['WhatsApp'],
    }),
    sendWhatsAppMessage: builder.mutation<{ success: boolean }, { phone: string; message: string }>({
      query: (body) => ({ url: '/whatsapp/send', method: 'POST', body }),
    }),
    sendWhatsAppBulk: builder.mutation<
      { total: number; sent: number; failed: { phone: string; reason: string }[] },
      { recipients: { phone: string; name?: string }[]; message: string; delayMs?: number }
    >({
      query: (body) => ({ url: '/whatsapp/send-bulk', method: 'POST', body, timeout: 300000 }),
    }),
    sendWhatsAppToClass: builder.mutation<
      { total: number; sent: number; failed: { phone: string; reason: string }[] },
      { classId: string; message: string }
    >({
      query: (body) => ({ url: '/whatsapp/send-to-class', method: 'POST', body, timeout: 300000 }),
    }),
    sendWhatsAppToAll: builder.mutation<
      { total: number; sent: number; failed: { phone: string; reason: string }[] },
      { message: string; classId?: string }
    >({
      query: (body) => ({ url: '/whatsapp/send-to-all', method: 'POST', body, timeout: 300000 }),
    }),
    sendWhatsAppFeeAlerts: builder.mutation<
      { total: number; sent: number; failed: { phone: string; name: string; reason: string }[] },
      { studentIds?: string[]; classId?: string; message?: string; feeStatus?: string }
    >({
      query: (body) => ({ url: '/whatsapp/fee-alerts', method: 'POST', body, timeout: 300000 }),
    }),
  }),
});

export const {
  // Dashboard
  useGetSchoolDashboardQuery,
  // Classes
  useGetSchoolClassesQuery,
  useGetSchoolClassQuery,
  useCreateSchoolClassMutation,
  useUpdateSchoolClassMutation,
  useDeleteSchoolClassMutation,
  // Sections
  useGetSectionsQuery,
  useGetAllSectionsQuery,
  useGetSectionQuery,
  useCreateSectionMutation,
  useUpdateSectionMutation,
  useDeleteSectionMutation,
  // Subjects
  useGetSubjectsQuery,
  useGetSubjectQuery,
  useCreateSubjectMutation,
  useUpdateSubjectMutation,
  useDeleteSubjectMutation,
  // Students
  useGetStudentsQuery,
  useGetStudentQuery,
  useGetStudentsByClassQuery,
  useGetStudentAdmissionFormQuery,
  useCreateStudentMutation,
  useUpdateStudentMutation,
  useDeleteStudentMutation,
  useBulkImportStudentsMutation,
  useAdmitStudentMutation,
  useGetPromotionEligibilityQuery,
  usePromoteStudentsMutation,
  // Teachers
  useGetTeachersQuery,
  useGetTeacherQuery,
  useCreateTeacherMutation,
  useUpdateTeacherMutation,
  useDeleteTeacherMutation,
  // Attendance
  useGetSchoolAttendancesQuery,
  useGetSchoolAttendanceQuery,
  useGetAttendanceByClassQuery,
  useMarkBulkAttendanceMutation,
  useScanBarcodeMutation,
  useUpdateSchoolAttendanceMutation,
  useDeleteSchoolAttendanceMutation,
  // Exams
  useGetExamsQuery,
  useGetExamQuery,
  useCreateExamMutation,
  useUpdateExamMutation,
  useDeleteExamMutation,
  useBulkUpdateExamsMutation,
  useBulkDeleteExamsMutation,
  // Marks
  useGetMarksQuery,
  useGetMarkQuery,
  useGetMarksByExamQuery,
  useGetStudentResultQuery,
  useCreateMarkMutation,
  useCreateBulkMarksMutation,
  useUpdateMarkMutation,
  useDeleteMarkMutation,
  // Fees
  useGetSchoolFeesQuery,
  useGetSchoolFeeQuery,
  useGetStudentFeesQuery,
  useGetOverdueFeesQuery,
  useCreateSchoolFeeMutation,
  useCreateBulkFeesMutation,
  usePaySchoolFeeMutation,
  useUpdateSchoolFeeMutation,
  useDeleteSchoolFeeMutation,
  // Time Slots
  useGetActiveTimeSlotsQuery,
  useGetTimeSlotsQuery,
  useCreateTimeSlotMutation,
  useBulkCreateTimeSlotsMutation,
  useDeleteTimeSlotMutation,
  // Timetables
  useGetTimetablesQuery,
  useGetTimetableQuery,
  useGetTimetableByClassQuery,
  useGetTimetableByTeacherQuery,
  useAutoGenerateTimetableMutation,
  useBulkGenerateTimetablesMutation,
  useCheckTimetableConflictMutation,
  useCreateTimetableMutation,
  useUpdateTimetableMutation,
  useDeleteTimetableMutation,
  // Visitors
  useGetVisitorsQuery,
  useGetVisitorQuery,
  useGetVisitorStatsQuery,
  useCheckVisitorDuplicateQuery,
  useCreateVisitorMutation,
  useUpdateVisitorMutation,
  useDeleteVisitorMutation,
  useAddVisitorFollowUpMutation,
  // School Reports
  useGetStudentProgressReportQuery,
  useGetExamResultSheetQuery,
  // Teacher Portal
  useGetTeacherPortalMeQuery,
  useGetTeacherPortalStudentsQuery,
  useGetTeacherPortalExamsQuery,
  useGetTeacherPortalSubjectsQuery,
  useGetTeacherPortalAttendanceQuery,
  useGetTeacherPortalDashboardQuery,
  useGetTeacherPortalTimetableQuery,
  useGetTeacherPortalMarksQuery,
  useGetTeacherPortalExamStudentsQuery,
  useSaveTeacherPortalBulkMarksMutation,
  useMarkTeacherPortalBulkAttendanceMutation,
  useGetTeacherPortalMyAttendanceQuery,
  useGetTeacherPortalDiariesQuery,
  useCreateTeacherPortalDiaryMutation,
  useDeleteTeacherPortalDiaryMutation,
  // Notifications
  useGetMyNotificationsQuery,
  useGetNotificationUnreadCountQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useSendNotificationMutation,
  useGetSentNotificationsQuery,
  useDeleteNotificationMutation,
  // Parent Portal
  useGetParentPortalChildrenQuery,
  useGetParentPortalResultsQuery,
  useGetParentPortalExamsQuery,
  useGetParentPortalDiaryQuery,
  useGetParentPortalAttendanceQuery,
  useGetParentPortalFeesQuery,
  useGetParentPortalReportQuery,
  useGetParentPortalBankAccountsQuery,
  useGetParentPortalPaymentRequestsQuery,
  useCreateParentPortalPaymentRequestMutation,
  // Fee Payment Requests (admin)
  useGetFeePaymentRequestsQuery,
  useGetFeePaymentRequestPendingCountQuery,
  useApproveFeePaymentRequestMutation,
  useRejectFeePaymentRequestMutation,
  // Daily Diary (admin)
  useGetDiariesQuery,
  useGetDiaryQuery,
  useCreateDiaryMutation,
  useUpdateDiaryMutation,
  useDeleteDiaryMutation,
  // Teacher Attendance
  useGetTeacherAttendancesQuery,
  useGetTeacherAttendanceQuery,
  useGetTeacherAttendanceTodayStatsQuery,
  useMarkTeacherAttendanceMutation,
  useMarkBulkTeacherAttendanceMutation,
  useUpdateTeacherAttendanceMutation,
  useDeleteTeacherAttendanceMutation,
  // Teacher Leaves
  useGetTeacherLeavesQuery,
  useGetTeacherLeaveQuery,
  useApplyTeacherLeaveMutation,
  useApproveTeacherLeaveMutation,
  useRejectTeacherLeaveMutation,
  useCancelTeacherLeaveMutation,
  useDeleteTeacherLeaveMutation,
  // Teacher Payroll
  useGetTeacherPayrollsQuery,
  useGetTeacherPayrollQuery,
  useGenerateTeacherPayrollMutation,
  useMarkTeacherPayrollPaidMutation,
  useUpdateTeacherPayrollMutation,
  useDeleteTeacherPayrollMutation,
  // Teacher Assignments
  useGetTeacherAssignmentsQuery,
  useGetTeacherAssignmentQuery,
  useGetTeacherAssignmentsByTeacherQuery,
  useGetClassOverviewQuery,
  useCreateTeacherAssignmentMutation,
  useDeleteTeacherAssignmentMutation,
  // Fee Categories
  useGetFeeCategoriesQuery,
  useGetIncomeCategoriesQuery,
  useGetExpenseCategoriesQuery,
  useCreateFeeCategoryMutation,
  useUpdateFeeCategoryMutation,
  useDeleteFeeCategoryMutation,
  useSeedFeeCategoriesMutation,
  // Fee Structures
  useGetFeeStructuresQuery,
  useGetFeeStructureQuery,
  useGetFeeStructureByClassQuery,
  useCreateFeeStructureMutation,
  useUpdateFeeStructureMutation,
  useDeleteFeeStructureMutation,
  // Fee Vouchers
  useGetFeeVouchersQuery,
  useGetFeeVoucherQuery,
  useGetStudentFeeVouchersQuery,
  useGetStudentFeeSummaryQuery,
  useGetStudentFeeLedgerQuery,
  useGetFeeVoucherStatsQuery,
  useCreateFeeVoucherMutation,
  useBulkGenerateFeeVouchersMutation,
  useBulkGenerateExamFeeVouchersMutation,
  usePayFeeVoucherMutation,
  useUpdateFeeVoucherMutation,
  useDeleteFeeVoucherMutation,
  useGetFeeVouchersForPrintMutation,
  useReconcileFeeVouchersMutation,
  useBulkPayStudentFeeVouchersMutation,
  useRecordStudentAdvancePaymentMutation,
  useGetStudentCreditHistoryQuery,
  useGetStudentBalancesQuery,
  useGetReceivableSummaryQuery,
  useGetYearlyFeeReportQuery,
  // School Transactions
  useGetSchoolTransactionsQuery,
  useCreateSchoolTransactionMutation,
  useUpdateSchoolTransactionMutation,
  useDeleteSchoolTransactionMutation,
  useGetTransactionMonthlySummaryQuery,
  useGetTransactionCategoryReportQuery,
  useGetTransactionYearlyTrendQuery,
  // School Accounting Dashboard & Reports
  useGetSchoolAccountingDashboardQuery,
  useGetSchoolMonthlyReportQuery,
  useGetSchoolCategoryReportQuery,
  useGetSchoolTeacherSalaryReportQuery,
  useGetSchoolStudentFeeReportQuery,
  // School Reports Engine
  useGetReportEngineQuery,
  useGetReportFinancialMonthlyQuery,
  useGetReportFinancialDailyQuery,
  useGetReportFinancialCategoriesQuery,
  useGetReportFinancialPnlQuery,
  useGetReportStudentListQuery,
  useGetReportStudentFeeStatusQuery,
  useGetReportStudentAttendanceQuery,
  useGetReportTeacherSalaryQuery,
  useGetReportTeacherWorkloadQuery,
  useGetReportVouchersQuery,
  useGetReportAnalyticsQuery,
  // Accounts System
  useGetAccountsDashboardQuery,
  useGetChartOfAccountsQuery,
  useGetAccountTreeQuery,
  useGetPostingAccountsQuery,
  useGetAccountHeadByIdQuery,
  useSeedChartOfAccountsMutation,
  useCreateAccountHeadMutation,
  useUpdateAccountHeadMutation,
  useDeleteAccountHeadMutation,
  useGetJournalEntriesQuery,
  useGetJournalEntryByIdQuery,
  useCreateJournalEntryMutation,
  useReverseJournalEntryMutation,
  useGetBankAccountsQuery,
  useCreateBankAccountMutation,
  useUpdateBankAccountMutation,
  useDeleteBankAccountMutation,
  useGetBudgetsQuery,
  useCreateBudgetMutation,
  useUpdateBudgetMutation,
  useDeleteBudgetMutation,
  useGetGeneralLedgerQuery,
  useGetTrialBalanceQuery,
  useGetBalanceSheetQuery,
  useGetIncomeStatementQuery,
  useGetCashFlowStatementQuery,
  useGetBudgetVsActualQuery,
  // WhatsApp Messaging
  useGetWhatsAppStatusQuery,
  useConnectWhatsAppMutation,
  useDisconnectWhatsAppMutation,
  useClearWhatsAppSessionMutation,
  useSendWhatsAppMessageMutation,
  useSendWhatsAppBulkMutation,
  useSendWhatsAppToClassMutation,
  useSendWhatsAppToAllMutation,
  useSendWhatsAppFeeAlertsMutation,
} = schoolApi;
