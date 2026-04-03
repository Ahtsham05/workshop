import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Link } from '@tanstack/react-router'
import { Lock, Smartphone, Wrench, Receipt, TrendingUp, BarChart3, Users, GitBranch, Shield } from 'lucide-react'

interface UpgradeModalProps {
  open: boolean
  onClose: () => void
  /** If provided, highlights which tier the locked feature belongs to */
  requiredPlan?: 'growth' | 'business' | 'enterprise'
}

const GROWTH_FEATURES = [
  { icon: Smartphone, label: 'Load Management',   description: 'Manage mobile load transactions & commissions' },
  { icon: Wrench,     label: 'Repair System',      description: 'Track device repairs and service charges' },
  { icon: Receipt,    label: 'Bill Payments',      description: 'Handle utility & bill payment services' },
  { icon: TrendingUp, label: 'ROI Reports',        description: 'Measure return on investment in real time' },
  { icon: BarChart3,  label: 'Profit & Loss',      description: 'Full P&L across all business modules' },
]

const BUSINESS_FEATURES = [
  { icon: Users,      label: 'HR Management',      description: 'Employees, attendance, leave & payroll' },
  { icon: GitBranch,  label: 'Multi-branch',       description: 'Manage multiple store locations' },
  { icon: Shield,     label: 'Roles & Permissions',description: 'Granular access control per role' },
]

export function UpgradeModal({ open, onClose, requiredPlan = 'growth' }: UpgradeModalProps) {
  const showBusiness = requiredPlan === 'business'
  const features = showBusiness ? BUSINESS_FEATURES : GROWTH_FEATURES
  const planLabel = showBusiness ? 'Business Plan' : 'Growth Plan'
  const planRoute = '/subscription/pricing'

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <div className='flex items-center gap-2 mb-1'>
            <Lock className='h-5 w-5 text-yellow-500' />
            <DialogTitle>Upgrade to {planLabel}</DialogTitle>
          </div>
          <DialogDescription>
            The following features are included in the{' '}
            <span className='font-semibold text-foreground'>{planLabel}</span>.
          </DialogDescription>
        </DialogHeader>

        <ul className='space-y-3 my-2'>
          {features.map(({ icon: Icon, label, description }) => (
            <li key={label} className='flex items-start gap-3 rounded-md border p-3'>
              <Icon className='h-5 w-5 mt-0.5 text-muted-foreground shrink-0' />
              <div>
                <p className='text-sm font-medium leading-tight'>{label}</p>
                <p className='text-xs text-muted-foreground mt-0.5'>{description}</p>
              </div>
              <Badge variant='secondary' className='ml-auto shrink-0 text-xs'>
                {planLabel}
              </Badge>
            </li>
          ))}
        </ul>

        <DialogFooter className='flex-col gap-2 sm:flex-row'>
          <Button variant='outline' onClick={onClose} className='w-full sm:w-auto'>
            Maybe Later
          </Button>
          <Button asChild className='w-full sm:w-auto' onClick={onClose}>
            <Link to={planRoute}>Upgrade to {planLabel} →</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
