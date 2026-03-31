import {
  // IconBrowserCheck,
  IconChecklist,
  // IconHelp,
  IconLayoutDashboard,
  IconLockAccess,
  // IconMessages,
  IconPackages,
  // IconPalette,
  // IconSettings,
  // IconTool,
  // IconUserCog,
  IconUsers,
  IconCategory,
  IconShield,
  // IconRefresh,
  IconCalendar,
  IconCalendarEvent,
  IconCash,
  IconBuilding,
  IconSettings,
  IconUsersGroup,
  IconBuildingStore,
  IconCreditCard,
  IconChartBar,
  IconCrown,
} from '@tabler/icons-react'
import { Command, NotebookText, Smartphone, WalletCards, Wrench } from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: 'admin',
    email: 'admin@gmail.com',
    avatar: '/avatars/shadcn.jpg',
  },
  teams: [
    {
      name: 'Logix Plus Solutions',
      logo: Command,
      plan: 'Admin Dashboard',
    },
  ],
  navGroups: [
    {
      title: 'General',
      items: [
        {
          title: 'Dashboard',
          url: '/',
          icon: IconLayoutDashboard,
        },
        // {
        //   title: 'Users',
        //   url: '/users',
        //   icon: IconUsers,
        // },
        {
          title: 'Suppliers',
          url: '/suppliers',
          icon: IconUsers,
          permission: 'viewSuppliers',
        },
        {
          title: 'Customers',
          url: '/customers',
          icon: IconUsers,
          permission: 'viewCustomers',
        },
        {
          title: 'Categories',
          url: '/categories',
          icon: IconCategory,
          permission: 'viewCategories',
        },
        {
          title: 'Products',
          url: '/products',
          icon: IconPackages,
          permission: 'viewProducts',
        },
        {
          title: 'Purchases',
          url: '/purchase-invoice',
          icon: IconPackages,
          permission: 'viewPurchases',
        },
        {
          title: 'Invoices',
          url: '/invoice',
          icon: IconPackages,
          permission: 'viewInvoices',
        },
        // {
        //   title: 'Returns',
        //   url: '/returns',
        //   icon: IconRefresh,
        // },
        {
          title: 'Accounts',
          url: '/accounting',
          icon: IconChecklist,
          // No specific permission for accounting - will always show if user is authenticated
        },
        // {
        //   title: 'Chats',
        //   url: '/chats',
        //   badge: '3',
        //   icon: IconMessages,
        // },
      ],
    },
    {
      title: 'Human Resources',
      items: [
        {
          title: 'HR Dashboard',
          url: '/hr',
          icon: IconLayoutDashboard,
        },
        {
          title: 'Employees',
          url: '/hr/employees',
          icon: IconUsers,
        },
        {
          title: 'Departments',
          url: '/hr/departments',
          icon: IconBuilding,
        },
        {
          title: 'Attendance',
          url: '/hr/attendance',
          icon: IconCalendar,
        },
        {
          title: 'Leave Management',
          url: '/hr/leaves',
          icon: IconCalendarEvent,
        },
        {
          title: 'Payroll',
          url: '/hr/payroll',
          icon: IconCash,
        },
        {
          title: 'HR Settings',
          url: '/hr/settings',
          icon: IconSettings,
        },
      ],
    },
    {
      title: 'Administration',
      items: [
        {
          title: 'Users Management',
          url: '/users-management',
          icon: IconUsers,
          permission: 'viewUsers',
        },
        {
          title: 'Roles & Permissions',
          url: '/roles',
          icon: IconShield,
          permission: 'viewRoles',
        },
        {
          title: 'Branch Management',
          url: '/branches',
          icon: IconBuildingStore,
          systemRole: ['superAdmin', 'system_admin'],
        },
        {
          title: 'Staff Management',
          url: '/staff',
          icon: IconUsersGroup,
          systemRole: ['superAdmin', 'branchAdmin', 'system_admin'],
        },
      ],
    },
    {
      title: 'Mobile Shop',
      items: [
        {
          title: 'Wallet',
          url: '/mobile-shop/wallet',
          icon: WalletCards,
          businessTypes: ['mobile_shop'],
        },
        {
          title: 'Load Management',
          url: '/mobile-shop/load',
          icon: Smartphone,
          businessTypes: ['mobile_shop'],
        },
        {
          title: 'Repair',
          url: '/mobile-shop/repair',
          icon: Wrench,
          businessTypes: ['mobile_shop'],
        },
        {
          title: 'Cash Book',
          url: '/mobile-shop/cash-book',
          icon: NotebookText,
          businessTypes: ['mobile_shop'],
        },
      ],
    },
    {
      title: 'Subscription',
      items: [
        {
          title: 'My Subscription',
          url: '/subscription',
          icon: IconCrown,
          systemRole: ['superAdmin', 'system_admin'],
        },
        {
          title: 'Pricing & Plans',
          url: '/subscription/pricing',
          icon: IconChartBar,
          systemRole: ['superAdmin', 'system_admin'],
        },
        {
          title: 'Buy / Renew Plan',
          url: '/subscription/payment',
          icon: IconCreditCard,
          systemRole: ['superAdmin', 'system_admin'],
        },
      ],
    },
    {
      title: 'System Admin',
      items: [
        {
          title: 'Payment Requests',
          url: '/admin',
          icon: IconCreditCard,
          systemRole: ['system_admin'],
        },
      ],
    },
    {
      title: 'Reports',
      items: [
        {
          title: 'Reports',
          url: '/reports',
          icon: IconLockAccess,
          permission: 'viewReports',
        },
        // {
        //   title: 'Errors',
        //   icon: IconBug,
        //   items: [
        //     {
        //       title: 'Unauthorized',
        //       url: '/401',
        //       icon: IconLock,
        //     },
        //     {
        //       title: 'Forbidden',
        //       url: '/403',
        //       icon: IconUserOff,
        //     },
        //     {
        //       title: 'Not Found',
        //       url: '/404',
        //       icon: IconError404,
        //     },
        //     {
        //       title: 'Internal Server Error',
        //       url: '/500',
        //       icon: IconServerOff,
        //     },
        //     {
        //       title: 'Maintenance Error',
        //       url: '/503',
        //       icon: IconBarrierBlock,
        //     },
        //   ],
        // },
      ],
    },
    // {
    //   title: 'Other',
    //   items: [
    //     {
    //       title: 'Settings',
    //       icon: IconSettings,
    //       items: [
    //         {
    //           title: 'Profile',
    //           url: '/settings',
    //           icon: IconUserCog,
    //         },
    //         {
    //           title: 'Account',
    //           url: '/settings/account',
    //           icon: IconTool,
    //         },
    //         {
    //           title: 'Appearance',
    //           url: '/settings/appearance',
    //           icon: IconPalette,
    //         },
    //         {
    //           title: 'Notifications',
    //           url: '/settings/notifications',
    //           icon: IconNotification,
    //         },
    //         {
    //           title: 'Display',
    //           url: '/settings/display',
    //           icon: IconBrowserCheck,
    //         },
    //       ],
    //     },
    //     {
    //       title: 'Help Center',
    //       url: '/help-center',
    //       icon: IconHelp,
    //     },
    //   ],
    // },
  ],
}
