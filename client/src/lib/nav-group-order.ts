/** Built-in order of the sidebar groups for a business type (school roles get their own). */
export function getGroupOrder(userBusinessType: string, schoolRole?: string): string[] {
  if (userBusinessType === 'school') {
    return schoolRole === 'teacher'
      ? ['My Classroom', 'Administration', 'Subscription', 'Reports', 'System Admin']
      : [
          'School Management',
          'Teachers',
          'Academics',
          'Fees & Accounts',
          'Portals',
          'Administration',
          'Subscription',
          'Reports',
          'System Admin',
        ]
  }
  if (userBusinessType === 'restaurant') {
    return [
      'Restaurant',
      'Human Resources',
      'Administration',
      'Subscription',
      'Reports',
      'System Admin',
    ]
  }
  return [
    'General',
    'Mobile Shop',
    'School Management',
    'Human Resources',
    'Reports',
    'Administration',
    'Subscription',
    'System Admin',
  ]
}
