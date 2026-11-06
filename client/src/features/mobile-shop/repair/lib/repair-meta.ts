import {
  Ban,
  Camera,
  CircleCheckBig,
  Cpu,
  Gamepad2,
  Hourglass,
  Inbox,
  Laptop,
  Monitor,
  PackageCheck,
  PackageSearch,
  Printer,
  Smartphone,
  Stethoscope,
  Tablet,
  Tv,
  WashingMachine,
  Watch,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type {
  RepairDeviceType,
  RepairPriority,
  RepairStatus,
} from '@/stores/mobile-shop.api'

// ─── Status workflow ─────────────────────────────────────────────────────────

export interface StatusMeta {
  value: RepairStatus
  label: string
  short: string
  icon: LucideIcon
  /** Pill classes — light + dark. */
  pill: string
  /** Board column accent (top border). */
  accent: string
}

export const STATUS_META: Record<RepairStatus, StatusMeta> = {
  pending: {
    value: 'pending',
    label: 'Received',
    short: 'Received',
    icon: Inbox,
    pill: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    accent: 'border-t-slate-400',
  },
  diagnosing: {
    value: 'diagnosing',
    label: 'Diagnosing',
    short: 'Diagnosing',
    icon: Stethoscope,
    pill: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
    accent: 'border-t-sky-500',
  },
  waiting_approval: {
    value: 'waiting_approval',
    label: 'Waiting for approval',
    short: 'Approval',
    icon: Hourglass,
    pill: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
    accent: 'border-t-amber-500',
  },
  waiting_parts: {
    value: 'waiting_parts',
    label: 'Waiting for parts',
    short: 'Parts',
    icon: PackageSearch,
    pill: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
    accent: 'border-t-orange-500',
  },
  in_progress: {
    value: 'in_progress',
    label: 'In repair',
    short: 'In repair',
    icon: Wrench,
    pill: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
    accent: 'border-t-blue-500',
  },
  completed: {
    value: 'completed',
    label: 'Ready for pickup',
    short: 'Ready',
    icon: CircleCheckBig,
    pill: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
    accent: 'border-t-emerald-500',
  },
  delivered: {
    value: 'delivered',
    label: 'Delivered',
    short: 'Delivered',
    icon: PackageCheck,
    pill: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
    accent: 'border-t-violet-500',
  },
  cancelled: {
    value: 'cancelled',
    label: 'Cancelled',
    short: 'Cancelled',
    icon: Ban,
    pill: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
    accent: 'border-t-rose-500',
  },
}

export const OPEN_STATUSES: RepairStatus[] = [
  'pending',
  'diagnosing',
  'waiting_approval',
  'waiting_parts',
  'in_progress',
]
/** Board columns, left to right. */
export const BOARD_STATUSES: RepairStatus[] = [...OPEN_STATUSES, 'completed']
/** Steps new jobs skip (they start In repair) — only shown when an older job is in one. */
export const SKIPPED_STATUSES: RepairStatus[] = ['pending', 'diagnosing']
export const ALL_STATUSES: RepairStatus[] = [
  ...OPEN_STATUSES,
  'completed',
  'delivered',
  'cancelled',
]

export const statusMeta = (s?: string) =>
  STATUS_META[(s as RepairStatus) || 'pending'] ?? STATUS_META.pending

/** The usual next step from each status — the primary button in the job sheet. */
export const NEXT_STEP: Partial<
  Record<RepairStatus, { to: RepairStatus; label: string }>
> = {
  pending: { to: 'in_progress', label: 'Start repair' },
  diagnosing: { to: 'in_progress', label: 'Start repair' },
  waiting_approval: {
    to: 'in_progress',
    label: 'Customer approved — start repair',
  },
  waiting_parts: { to: 'in_progress', label: 'Parts arrived — resume' },
  in_progress: { to: 'completed', label: 'Mark ready for pickup' },
}

// ─── Priority ────────────────────────────────────────────────────────────────

export const PRIORITY_META: Record<
  RepairPriority,
  { label: string; pill: string }
> = {
  low: {
    label: 'Low',
    pill: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
  normal: {
    label: 'Normal',
    pill: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  },
  high: {
    label: 'High',
    pill: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
  },
  urgent: { label: 'Urgent', pill: 'bg-rose-600 text-white' },
}

// ─── Devices ─────────────────────────────────────────────────────────────────

export interface DeviceMeta {
  value: RepairDeviceType
  label: string
  icon: LucideIcon
  brands: string[]
  serialLabel: string
  problems: string[]
  conditions: string[]
  accessories: string[]
  /** Whether a screen lock / password is worth asking for. */
  hasLock: boolean
}

const PHONE_CONDITIONS = [
  'Powers on',
  'Dead / no power',
  'Screen cracked',
  'Back glass cracked',
  'Body dents / scratches',
  'Water damage',
  'Bent frame',
  'Camera glass broken',
  'Missing screws',
  'Opened before',
]
const COMPUTER_CONDITIONS = [
  'Powers on',
  'Dead / no power',
  'Screen cracked',
  'Body cracked',
  'Hinge broken',
  'Missing keys',
  'Liquid spill',
  'Missing screws',
  'Opened before',
]

export const DEVICE_META: Record<RepairDeviceType, DeviceMeta> = {
  mobile: {
    value: 'mobile',
    label: 'Mobile',
    icon: Smartphone,
    brands: [
      'Samsung',
      'Apple',
      'Xiaomi',
      'Redmi',
      'Oppo',
      'Vivo',
      'Realme',
      'Infinix',
      'Tecno',
      'Itel',
      'Huawei',
      'OnePlus',
      'Nokia',
      'Motorola',
      'Google Pixel',
    ],
    serialLabel: 'IMEI',
    problems: [
      'Screen broken',
      'Touch not working',
      'Battery issue',
      'Charging port',
      'Not charging',
      'Dead / no power',
      'Speaker / mic',
      'Camera',
      'Water damage',
      'Network / signal',
      'Software / flashing',
      'FRP / lock',
      'Back glass',
      'Buttons',
      'Restarting',
      'Wi-Fi / Bluetooth',
    ],
    conditions: PHONE_CONDITIONS,
    accessories: [
      'Charger',
      'Cable',
      'Back cover',
      'SIM card',
      'SIM tray',
      'Memory card',
      'Box',
      'Earphones',
    ],
    hasLock: true,
  },
  tablet: {
    value: 'tablet',
    label: 'Tablet',
    icon: Tablet,
    brands: [
      'Apple iPad',
      'Samsung',
      'Lenovo',
      'Huawei',
      'Xiaomi',
      'Amazon Fire',
    ],
    serialLabel: 'Serial / IMEI',
    problems: [
      'Screen broken',
      'Touch not working',
      'Battery issue',
      'Charging port',
      'Not charging',
      'Dead / no power',
      'Software / flashing',
      'Speaker / mic',
      'Camera',
      'Water damage',
    ],
    conditions: PHONE_CONDITIONS,
    accessories: [
      'Charger',
      'Cable',
      'Cover / case',
      'Stylus',
      'Keyboard',
      'SIM card',
      'Box',
    ],
    hasLock: true,
  },
  laptop: {
    value: 'laptop',
    label: 'Laptop',
    icon: Laptop,
    brands: [
      'Dell',
      'HP',
      'Lenovo',
      'Apple MacBook',
      'Acer',
      'Asus',
      'MSI',
      'Toshiba',
      'Microsoft Surface',
      'Huawei',
    ],
    serialLabel: 'Serial / service tag',
    problems: [
      'No display',
      'Not powering on',
      'Screen broken',
      'Keyboard',
      'Touchpad',
      'Battery issue',
      'Not charging',
      'Overheating',
      'Slow / hanging',
      'Windows / OS install',
      'Virus / malware',
      'Data recovery',
      'Hinge broken',
      'Liquid spill',
      'Upgrade RAM / SSD',
      'Wi-Fi',
      'Ports / USB',
      'Sound',
    ],
    conditions: COMPUTER_CONDITIONS,
    accessories: [
      'Charger / adapter',
      'Power cable',
      'Bag',
      'Mouse',
      'Battery',
      'External drive',
    ],
    hasLock: true,
  },
  desktop: {
    value: 'desktop',
    label: 'Desktop',
    icon: Monitor,
    brands: [
      'Dell',
      'HP',
      'Lenovo',
      'Apple iMac',
      'Custom build',
      'Acer',
      'Asus',
    ],
    serialLabel: 'Serial / service tag',
    problems: [
      'Not powering on',
      'No display',
      'Restarting',
      'Blue screen',
      'Slow / hanging',
      'Windows / OS install',
      'Virus / malware',
      'Data recovery',
      'Overheating / noise',
      'Power supply',
      'Upgrade RAM / SSD',
      'Graphics card',
      'Network',
      'Ports / USB',
    ],
    conditions: [
      'Powers on',
      'Dead / no power',
      'Case damaged',
      'Side panel missing',
      'Dusty',
      'Opened before',
    ],
    accessories: [
      'Power cable',
      'Keyboard',
      'Mouse',
      'Monitor',
      'Monitor cable',
      'Wi-Fi adapter',
    ],
    hasLock: true,
  },
  printer: {
    value: 'printer',
    label: 'Printer',
    icon: Printer,
    brands: ['HP', 'Canon', 'Epson', 'Brother', 'Samsung', 'Ricoh', 'Kyocera'],
    serialLabel: 'Serial number',
    problems: [
      'Paper jam',
      'Not printing',
      'Faded / lines',
      'Not picking paper',
      'Toner / cartridge',
      'Head cleaning',
      'Scanner',
      'Error code',
      'Connectivity',
      'Drum / fuser',
    ],
    conditions: [
      'Powers on',
      'Dead / no power',
      'Body cracked',
      'Tray broken',
      'Missing cartridge',
      'Opened before',
    ],
    accessories: ['Power cable', 'USB cable', 'Cartridge / toner', 'Tray'],
    hasLock: false,
  },
  tv: {
    value: 'tv',
    label: 'TV',
    icon: Tv,
    brands: [
      'Samsung',
      'LG',
      'Sony',
      'TCL',
      'Haier',
      'Changhong Ruba',
      'Orient',
      'Xiaomi',
    ],
    serialLabel: 'Serial number',
    problems: [
      'No picture',
      'No sound',
      'Lines on screen',
      'Backlight',
      'Not powering on',
      'Panel broken',
      'Remote / sensor',
      'HDMI / ports',
      'Software / apps',
      'Power supply board',
    ],
    conditions: [
      'Powers on',
      'Dead / no power',
      'Panel cracked',
      'Stand missing',
      'Back cover damaged',
    ],
    accessories: ['Remote', 'Stand', 'Wall bracket', 'Power cable'],
    hasLock: false,
  },
  console: {
    value: 'console',
    label: 'Console',
    icon: Gamepad2,
    brands: ['Sony PlayStation', 'Microsoft Xbox', 'Nintendo'],
    serialLabel: 'Serial number',
    problems: [
      'No display / HDMI',
      'Not powering on',
      'Overheating / noise',
      'Disc drive',
      'Controller drift',
      'Controller not charging',
      'Software / update',
      'Storage',
    ],
    conditions: [
      'Powers on',
      'Dead / no power',
      'Body cracked',
      'Seal broken',
      'Opened before',
    ],
    accessories: ['Controller', 'Power cable', 'HDMI cable', 'Box'],
    hasLock: false,
  },
  smartwatch: {
    value: 'smartwatch',
    label: 'Smartwatch',
    icon: Watch,
    brands: [
      'Apple Watch',
      'Samsung Galaxy Watch',
      'Huawei',
      'Xiaomi',
      'Amazfit',
      'Garmin',
    ],
    serialLabel: 'Serial number',
    problems: [
      'Screen broken',
      'Battery issue',
      'Not charging',
      'Strap / buckle',
      'Water damage',
      'Software / pairing',
    ],
    conditions: ['Powers on', 'Dead / no power', 'Screen cracked', 'Scratches'],
    accessories: ['Charger', 'Strap', 'Box'],
    hasLock: true,
  },
  camera: {
    value: 'camera',
    label: 'Camera',
    icon: Camera,
    brands: ['Canon', 'Nikon', 'Sony', 'Fujifilm', 'GoPro', 'DJI'],
    serialLabel: 'Serial number',
    problems: [
      'Lens error',
      'Not powering on',
      'Shutter',
      'Screen',
      'Memory card error',
      'Battery / charging',
      'Water / sand damage',
      'Focus',
    ],
    conditions: [
      'Powers on',
      'Dead / no power',
      'Lens scratched',
      'Body damaged',
    ],
    accessories: [
      'Lens',
      'Lens cap',
      'Battery',
      'Charger',
      'Strap',
      'Memory card',
      'Bag',
    ],
    hasLock: false,
  },
  appliance: {
    value: 'appliance',
    label: 'Appliance',
    icon: WashingMachine,
    brands: [
      'Haier',
      'Dawlance',
      'PEL',
      'Orient',
      'Gree',
      'Kenwood',
      'Philips',
      'Anex',
      'Westpoint',
    ],
    serialLabel: 'Serial number',
    problems: [
      'Not working',
      'Not powering on',
      'Noise',
      'Leaking',
      'Not heating / cooling',
      'Motor',
      'PCB / board',
      'Wiring',
    ],
    conditions: [
      'Powers on',
      'Dead / no power',
      'Body damaged',
      'Parts missing',
    ],
    accessories: ['Power cable', 'Remote', 'Pipe / hose', 'Stand'],
    hasLock: false,
  },
  other: {
    value: 'other',
    label: 'Other',
    icon: Cpu,
    brands: [],
    serialLabel: 'Serial number',
    problems: [
      'Not working',
      'Not powering on',
      'Broken part',
      'Software',
      'Service / cleaning',
    ],
    conditions: [
      'Powers on',
      'Dead / no power',
      'Body damaged',
      'Parts missing',
      'Opened before',
    ],
    accessories: ['Charger', 'Cable', 'Box', 'Bag'],
    hasLock: false,
  },
}

export const DEVICE_TYPES = Object.values(DEVICE_META)
export const deviceMeta = (t?: string) =>
  DEVICE_META[(t as RepairDeviceType) || 'mobile'] ?? DEVICE_META.other

// ─── Money helpers ───────────────────────────────────────────────────────────

export const balanceOf = (job: { charges?: number; advanceAmount?: number }) =>
  Math.round(((job.charges ?? 0) - (job.advanceAmount ?? 0)) * 100) / 100

export const isOverdue = (job: { status: string; dueDate?: string | null }) =>
  !!job.dueDate &&
  OPEN_STATUSES.includes(job.status as RepairStatus) &&
  new Date(job.dueDate).getTime() < Date.now()

/** Display reference — legacy jobs have no number, so fall back to the id tail. */
export const jobRef = (job: { jobNumber?: string; id: string }) =>
  job.jobNumber || `#${job.id.slice(-6).toUpperCase()}`

export const salesmanLabel = (ref: unknown): string => {
  if (!ref) return ''
  if (typeof ref === 'string') return ''
  const r = ref as { name?: string }
  return r.name || ''
}

/** A catalog product's category names (multi-category + the legacy single field). */
export const categoriesOf = (c: {
  category?: string
  categories?: { name: string }[]
}) => {
  const names = (c.categories ?? []).map((x) => x.name).filter(Boolean)
  if (c.category && !names.includes(c.category)) names.push(c.category)
  return names
}
