import {
  Boxes,
  ClipboardList,
  Cog,
  FileStack,
  Gauge,
  ListChecks,
  PackageMinus,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

export interface NavSection {
  to: string
  label: string
  icon: LucideIcon
  /** Words that should also find this section in the command search. */
  keywords?: string
  exact?: boolean
  permission?: 'manageManufacturingSettings'
}

export interface NavGroup {
  id: string
  label: string
  sections: NavSection[]
}

/**
 * The module's navigation: one flat row of tabs, no sub-menus — the pages a plant uses
 * every day, in the order the user asked for (Overview, Products, then BOM, Material Issues, WIP). (Assembly orders, quality, inventory and traceability pages still exist
 * as routes but are not in the menus.) A group with one section shows no sub-menu
 * (manufacturing-shell.tsx); keep it that way unless a tab really needs children.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    sections: [
      {
        to: '/manufacturing',
        label: 'Overview',
        icon: Gauge,
        keywords: 'home kpi overview dashboard',
        exact: true,
      },
    ],
  },
  {
    id: 'products',
    label: 'Products',
    sections: [
      {
        to: '/manufacturing/products',
        label: 'Products',
        icon: Boxes,
        keywords: 'items raw material classify',
      },
    ],
  },
  {
    id: 'boms',
    label: 'Bills of Materials',
    sections: [
      {
        to: '/manufacturing/boms',
        label: 'Bills of Materials',
        icon: FileStack,
        keywords: 'bom recipe',
      },
    ],
  },
  {
    id: 'material-issues',
    label: 'Material Issues',
    sections: [
      {
        to: '/manufacturing/material-issues',
        label: 'Material Issues',
        icon: PackageMinus,
        keywords: 'issue return picking miv',
      },
    ],
  },
  {
    id: 'wip',
    label: 'Work in Progress',
    sections: [
      {
        to: '/manufacturing/wip',
        label: 'Work in Progress',
        icon: Workflow,
        keywords: 'wip floor',
      },
    ],
  },
  {
    id: 'requirements',
    label: 'Requirements',
    sections: [
      {
        to: '/manufacturing/requirements',
        label: 'Requirements',
        icon: ListChecks,
        keywords: 'mrp shortage material',
      },
    ],
  },
  {
    id: 'production-orders',
    label: 'Production Orders',
    sections: [
      {
        to: '/manufacturing/production-orders',
        label: 'Production Orders',
        icon: ClipboardList,
        keywords: 'mo work order',
      },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    sections: [
      {
        to: '/manufacturing/settings',
        label: 'Settings',
        icon: Cog,
        keywords: 'configuration numbering demo',
        permission: 'manageManufacturingSettings',
      },
    ],
  },
]

export const isSectionActive = (pathname: string, section: NavSection) =>
  section.exact
    ? pathname === section.to || pathname === `${section.to}/`
    : pathname === section.to || pathname.startsWith(`${section.to}/`)
