import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Camera, Palette } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { UserAvatar } from '@/components/user-avatar'
import { ProfilePhotoDialog } from '@/components/profile-photo-dialog'
import { useGetMyProfileQuery } from '@/stores/user-preferences.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { useGetMyBranchesQuery } from '@/stores/branch.api'
import { PersonalInformationCard } from './components/personal-information-card'
import { SecurityCard } from './components/security-card'
import { AccountSummaryCard } from './components/account-summary-card'

/**
 * "My profile" — everything about the signed-in person's own account in one place:
 * their photo and details, their password, and the read-only facts an administrator
 * controls. Deliberately separate from Settings, which is about the business.
 */
export default function ProfilePage() {
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false)
  const { data: profile, isLoading } = useGetMyProfileQuery()
  const { data: organization } = useGetMyOrganizationQuery(undefined, {
    skip: !profile?.organizationId,
  })
  const { data: branches = [] } = useGetMyBranchesQuery(undefined, {
    skip: !profile?.organizationId,
  })

  const roleName =
    typeof profile?.role === 'object' && profile?.role ? profile.role.name : null

  return (
    <div className='mx-auto w-full max-w-5xl'>
    <div className='mb-6'>
        <h1 className='text-2xl font-bold tracking-tight md:text-3xl'>My profile</h1>
        <p className='text-muted-foreground'>
          Manage your photo, your details and your password.
        </p>
      </div>

      {/* Identity banner */}
      <Card className='mb-6 overflow-hidden py-0'>
        <div className='bg-sidebar h-20 w-full' />
        <CardContent className='flex flex-col gap-4 pt-0 pb-6 sm:flex-row sm:items-center'>
          <div className='relative -mt-12 w-fit'>
            <UserAvatar
              name={profile?.name}
              email={profile?.email}
              photoUrl={profile?.photo?.url}
              className='ring-background h-20 w-20 ring-4'
              fallbackClassName='text-xl'
            />
            <Button
              type='button'
              size='icon'
              variant='secondary'
              aria-label='Change photo'
              onClick={() => setPhotoDialogOpen(true)}
              className='absolute right-0 bottom-0 h-7 w-7 rounded-full shadow'
            >
              <Camera className='h-3.5 w-3.5' />
            </Button>
          </div>

          <div className='min-w-0 flex-1 pb-1'>
            {isLoading ? (
              <>
                <Skeleton className='h-6 w-40' />
                <Skeleton className='mt-2 h-4 w-56' />
              </>
            ) : (
              <>
                <h2 className='truncate text-xl font-semibold'>{profile?.name}</h2>
                <p className='text-muted-foreground truncate text-sm'>{profile?.email}</p>
              </>
            )}
            <div className='mt-2 flex flex-wrap gap-2'>
              {roleName && <Badge variant='secondary'>{roleName}</Badge>}
              {organization?.name && <Badge variant='outline'>{organization.name}</Badge>}
            </div>
          </div>

          <div className='flex flex-wrap gap-2 pb-1'>
            <Button type='button' variant='outline' onClick={() => setPhotoDialogOpen(true)}>
              <Camera className='mr-2 h-4 w-4' />
              {profile?.photo?.url ? 'Change photo' : 'Add photo'}
            </Button>
            <Button type='button' variant='ghost' asChild>
              <Link to='/settings/appearance'>
                <Palette className='mr-2 h-4 w-4' />
                Appearance
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className='grid gap-6 lg:grid-cols-3'>
        <div className='space-y-6 lg:col-span-2'>
          <PersonalInformationCard profile={profile} isLoading={isLoading} />
          <SecurityCard />
        </div>
        <div className='space-y-6'>
          <AccountSummaryCard
            profile={profile}
            isLoading={isLoading}
            organizationName={organization?.name}
            branchNames={branches.map((b) => b.name)}
          />
        </div>
      </div>

      <ProfilePhotoDialog open={photoDialogOpen} onOpenChange={setPhotoDialogOpen} />
    </div>
  )
}
