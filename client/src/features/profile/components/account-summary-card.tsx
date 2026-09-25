import { Building2, CalendarDays, GitBranch, ShieldCheck, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { MyProfile } from '@/stores/user-preferences.api'

const ACCESS_LABELS: Record<string, string> = {
  system_admin: 'Platform administrator',
  superAdmin: 'Owner / Super admin',
  branchAdmin: 'Branch administrator',
  staff: 'Staff',
}

function Row({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: LucideIcon
  label: string
  value?: string | null
  loading?: boolean
}) {
  return (
    <div className='flex items-start gap-3 py-2.5'>
      <Icon className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0' aria-hidden />
      <div className='min-w-0 flex-1'>
        <p className='text-muted-foreground text-xs'>{label}</p>
        {loading ? (
          <Skeleton className='mt-1 h-4 w-32' />
        ) : (
          <p className='truncate text-sm font-medium'>{value || '—'}</p>
        )}
      </div>
    </div>
  )
}

interface Props {
  profile?: MyProfile
  isLoading: boolean
  organizationName?: string
  branchNames: string[]
}

/** Read-only facts about the account — what an admin granted, not what you can change. */
export function AccountSummaryCard({
  profile,
  isLoading,
  organizationName,
  branchNames,
}: Props) {
  const roleName =
    typeof profile?.role === 'object' && profile?.role ? profile.role.name : undefined
  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>
          Set by your administrator. Ask them if something here needs to change.
        </CardDescription>
      </CardHeader>
      <CardContent className='divide-y py-0'>
        <Row icon={Users} label='Role' value={roleName} loading={isLoading} />
        <Row
          icon={ShieldCheck}
          label='Access level'
          value={profile?.systemRole ? ACCESS_LABELS[profile.systemRole] ?? profile.systemRole : undefined}
          loading={isLoading}
        />
        <Row icon={Building2} label='Organization' value={organizationName} loading={isLoading} />
        <Row
          icon={GitBranch}
          label={branchNames.length === 1 ? 'Branch' : 'Branches'}
          value={branchNames.length ? branchNames.join(', ') : undefined}
          loading={isLoading}
        />
        <Row icon={CalendarDays} label='Member since' value={memberSince} loading={isLoading} />
      </CardContent>
    </Card>
  )
}
