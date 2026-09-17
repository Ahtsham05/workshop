/**
 * The registry's `category` field (server/src/config/quick-link-registry.js) is
 * fine-grained — 30+ values, one per sidebar sub-group (e.g. every "Reports · X"
 * sub-report gets its own category) — which is right for the Customize dialog's
 * grouped picker but far too many pills for a compact filter row. This collapses
 * those into a handful of umbrella groups for the floating voice widget's category
 * pills. Add new registry categories to the right group here; anything unmapped
 * falls back to 'business' rather than silently disappearing from every filter.
 */
export interface QuickLinkCategoryGroup {
  id: string
  label: string
  categories: string[]
}

export const QUICK_LINK_CATEGORY_GROUPS: QuickLinkCategoryGroup[] = [
  {
    id: 'business',
    label: 'Business',
    categories: ['General', 'Catalog & Inventory', 'Contacts', 'AI Tools', 'Communications'],
  },
  { id: 'sales', label: 'Sales', categories: ['Sales'] },
  { id: 'purchasing', label: 'Purchasing', categories: ['Purchasing'] },
  {
    id: 'finance',
    label: 'Finance',
    categories: ['Accounts', 'Accounts System', 'Finance & Banking'],
  },
  {
    id: 'reports',
    label: 'Reports',
    categories: [
      'Reports',
      'Reports · Overview',
      'Reports · Sales & Customers',
      'Reports · Purchases & Suppliers',
      'Reports · Inventory & Stock',
      'Reports · Finance & Accounts',
      'Reports · Team & Partners',
      'Reports · Mobile Shop',
      'Reports · Fee Collection',
      'Reports · Financial',
      'Reports · Students',
      'Reports · Teachers',
      'Reports · Vouchers & Analytics',
    ],
  },
  { id: 'mobile_shop', label: 'Mobile Shop', categories: ['Mobile Shop'] },
  { id: 'restaurant', label: 'Restaurant', categories: ['Restaurant'] },
  {
    id: 'admin',
    label: 'Admin',
    categories: ['Human Resources', 'Administration', 'Subscription', 'System Admin'],
  },
  {
    id: 'school',
    label: 'School',
    categories: ['School Management', 'My Classroom', 'Teachers', 'Academics', 'Portals', 'Fees & Accounts'],
  },
]

const CATEGORY_TO_GROUP_ID = new Map(
  QUICK_LINK_CATEGORY_GROUPS.flatMap((group) => group.categories.map((category) => [category, group.id])),
)

export const getQuickLinkCategoryGroupId = (category: string): string => CATEGORY_TO_GROUP_ID.get(category) || 'business'
