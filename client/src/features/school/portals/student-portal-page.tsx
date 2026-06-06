/**
 * Student Portal — reuses the family portal view, scoped to the logged-in
 * student's own profile (results, attendance, fees, full report).
 */
import ParentPortalPage from './parent-portal-page';

export default function StudentPortalPage() {
  return <ParentPortalPage variant="student" />;
}
