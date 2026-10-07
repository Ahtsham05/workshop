import {
  ArrowLeftRight,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  Cog,
  Component,
  FileStack,
  Gauge,
  Layers,
  ListChecks,
  Network,
  PackageCheck,
  PackageMinus,
  Recycle,
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
 * The module's information architecture: a handful of groups that match how a plant
 * works (plan → make → store → trace), each with its own sub-sections. Grouping keeps
 * the top navigation short enough to fit any screen without hiding anything.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    sections: [
      {
        to: '/manufacturing',
        label: 'Dashboard',
        icon: Gauge,
        exact: true,
        keywords: 'home kpi overview',
      },
    ],
  },
  {
    id: 'planning',
    label: 'Planning',
    sections: [
      {
        to: '/manufacturing/products',
        label: 'Products',
        icon: Boxes,
        keywords: 'items raw material classify',
      },
      {
        to: '/manufacturing/boms',
        label: 'Bills of Materials',
        icon: FileStack,
        keywords: 'bom recipe',
      },
      {
        to: '/manufacturing/assemblies',
        label: 'Structures',
        icon: Layers,
        keywords: 'assemblies multi-level tree',
      },
      {
        to: '/manufacturing/requirements',
        label: 'Requirements',
        icon: ListChecks,
        keywords: 'mrp shortage material',
      },
    ],
  },
  {
    id: 'production',
    label: 'Production',
    sections: [
      {
        to: '/manufacturing/production-orders',
        label: 'Production Orders',
        icon: ClipboardList,
        keywords: 'mo work order',
      },
      {
        to: '/manufacturing/assembly-orders',
        label: 'Assembly Orders',
        icon: Component,
        keywords: 'asm sub-assembly',
      },
      {
        to: '/manufacturing/material-issues',
        label: 'Material Issues',
        icon: PackageMinus,
        keywords: 'issue return picking',
      },
      {
        to: '/manufacturing/wip',
        label: 'Work in Progress',
        icon: Workflow,
        keywords: 'wip floor',
      },
      {
        to: '/manufacturing/quality',
        label: 'Quality Check',
        icon: ClipboardCheck,
        keywords: 'qc inspection',
      },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    sections: [
      {
        to: '/manufacturing/finished-goods',
        label: 'Finished Goods',
        icon: PackageCheck,
        keywords: 'receipts output stock',
      },
      {
        to: '/manufacturing/scrap',
        label: 'Scrap',
        icon: Recycle,
        keywords: 'waste reject loss',
      },
      {
        to: '/manufacturing/movements',
        label: 'Stock Movements',
        icon: ArrowLeftRight,
        keywords: 'ledger transactions',
      },
    ],
  },
  {
    id: 'traceability',
    label: 'Traceability',
    sections: [
      {
        to: '/manufacturing/traceability',
        label: 'Traceability',
        icon: Network,
        keywords: 'genealogy serial batch lot recall',
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
