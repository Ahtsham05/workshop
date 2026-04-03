import { useState } from 'react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Link } from '@tanstack/react-router'
import { Lock, Rocket } from 'lucide-react'
import { UpgradeModal } from '@/components/upgrade-modal'
import { getRequiredPlan, getRequiredPlanLabel } from '@/lib/feature-access'

interface LockedFeatureCardProps {
  /** Feature name shown in the heading */
  featureName: string
  /** Feature key used to determine required plan (e.g. 'hr_management', 'roi') */
  featureKey?: string
  /** Short explanation text */
  description?: string
  /** Current plan label (e.g. "Free Trial") */
  currentPlan?: string
}

/**
 * Drop this into any page/tab that is locked behind a higher plan.
 * Shows an informative card with an upgrade CTA.
 */
export function LockedFeatureCard({
  featureName,
  featureKey,
  description,
  currentPlan,
}: LockedFeatureCardProps) {
  const [modalOpen, setModalOpen] = useState(false)

  const requiredPlan = featureKey ? getRequiredPlan(featureKey) : 'growth'
  const requiredPlanLabel = featureKey ? getRequiredPlanLabel(featureKey) : 'Growth Plan'
  const defaultDescription = `This feature is available on the ${requiredPlanLabel} and above.`

  return (
    <>
      <UpgradeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        requiredPlan={requiredPlan as 'growth' | 'business' | 'enterprise'}
      />

      <Card className='border-dashed border-2 border-muted max-w-lg mx-auto mt-12'>
        <CardHeader className='text-center pb-2'>
          <div className='mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted'>
            <Lock className='h-7 w-7 text-muted-foreground' />
          </div>
          <CardTitle className='text-xl'>{featureName}</CardTitle>
          <div className='flex items-center justify-center gap-2 mt-1 flex-wrap'>
            {currentPlan && (
              <p className='text-xs text-muted-foreground'>
                Your plan: <Badge variant='outline' className='text-xs'>{currentPlan}</Badge>
              </p>
            )}
            <p className='text-xs text-muted-foreground'>
              Required: <Badge variant='secondary' className='text-xs'>{requiredPlanLabel}</Badge>
            </p>
          </div>
        </CardHeader>

        <CardContent className='text-center text-sm text-muted-foreground px-8'>
          {description ?? defaultDescription}
        </CardContent>

        <CardFooter className='flex flex-col gap-2 pb-6 px-8'>
          <Button className='w-full gap-2' onClick={() => setModalOpen(true)}>
            <Rocket className='h-4 w-4' />
            See What's Included
          </Button>
          <Button variant='outline' className='w-full' asChild>
            <Link to='/subscription/pricing'>View Pricing Plans</Link>
          </Button>
        </CardFooter>
      </Card>
    </>
  )
}
