import { Link } from '@tanstack/react-router'
import { Factory, Settings } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useManufacturingAccess } from '@/hooks/use-manufacturing-access'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import ManufacturingShell from './manufacturing-shell'

/**
 * /manufacturing/* — the module when it's on for this login, otherwise a clear message
 * instead of pages whose every request the server would refuse.
 */
export default function ManufacturingGate() {
  const { t } = useLanguage()
  const { hasPermission } = usePermissions()
  const { available, reason, isLoading } = useManufacturingAccess()

  if (isLoading) return <Skeleton className='m-4 h-96 rounded-xl' />
  if (available) return <ManufacturingShell />

  const byBusinessType = reason === 'business_type'
  return (
    <Card className='mx-auto mt-10 max-w-lg'>
      <CardContent className='flex flex-col items-center gap-3 p-8 text-center'>
        <div className='bg-muted text-muted-foreground flex h-12 w-12 items-center justify-center rounded-full'>
          <Factory className='h-6 w-6' aria-hidden />
        </div>
        <h1 className='text-lg font-semibold'>
          {t('Manufacturing is not enabled')}
        </h1>
        <p className='text-muted-foreground text-sm'>
          {byBusinessType
            ? t(
                'Manufacturing is available for businesses whose type is Manufacturing. Change the business type in Settings → Business Profile to turn it on.'
              )
            : t(
                'Manufacturing has not been enabled for your account yet. Contact Logix Plus support to get access.'
              )}
        </p>
        <div className='flex gap-2 pt-1'>
          {byBusinessType && hasPermission('manageBusinessProfile') && (
            <Button asChild>
              <Link to='/settings/business-profile'>
                <Settings className='mr-2 h-4 w-4' />
                {t('Business Profile')}
              </Link>
            </Button>
          )}
          <Button asChild variant='outline'>
            <Link to='/'>{t('Go to dashboard')}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
