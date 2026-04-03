import { Link } from '@tanstack/react-router'
import { Check, Zap, Store, Smartphone, Building2, Crown, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useGetBankDetailsQuery } from '@/stores/subscription.api'
import { useGetSubscriptionUsageQuery } from '@/stores/organization.api'

const PLAN_ICONS: Record<string, React.ElementType> = {
  trial:      Zap,
  starter:    Store,
  growth:     Smartphone,
  business:   Building2,
  enterprise: Crown,
  // legacy
  single:     Store,
  multi:      Building2,
}

const BADGE_STYLES: Record<string, string> = {
  'Most Popular': 'bg-primary text-primary-foreground',
  'Best Value':   'bg-green-600 text-white',
}

const PLAN_ORDER = ['starter', 'growth', 'business', 'enterprise']

export default function PricingPage() {
  const { data: bankData } = useGetBankDetailsQuery()
  const { data: usageData } = useGetSubscriptionUsageQuery()

  const plans = bankData?.plans ?? {}
  const currentPlan = usageData?.subscription?.planType

  const orderedPlans = PLAN_ORDER
    .map((key) => plans[key])
    .filter(Boolean)

  return (
    <div className='p-6 space-y-10'>
      {/* Hero */}
      <div className='text-center space-y-2'>
        <h1 className='text-3xl font-bold'>Choose Your Plan</h1>
        <p className='text-muted-foreground max-w-xl mx-auto'>
          Simple, transparent pricing. Pay via bank transfer — activate within 24 hours.
        </p>
      </div>

      {/* Trial banner */}
      {currentPlan === 'trial' && usageData?.subscription?.status === 'active' && (
        <div className='flex items-center justify-center gap-2 p-3 bg-primary/10 rounded-lg text-sm text-primary font-medium'>
          <Zap className='h-4 w-4' />
          You are currently on the 14-day Free Trial. Upgrade anytime.
        </div>
      )}

      {/* Plans grid */}
      <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 max-w-7xl mx-auto'>
        {orderedPlans.map((plan) => {
          const Icon = PLAN_ICONS[plan.planType] ?? Store
          const isCurrentPlan = currentPlan === plan.planType
          const badge = plan.badge as string | null | undefined
          const isEnterprise = plan.planType === 'enterprise'

          return (
            <Card
              key={plan.planType}
              className={`relative flex flex-col ${
                isCurrentPlan ? 'border-primary ring-2 ring-primary' : ''
              } ${badge === 'Most Popular' ? 'border-primary/60 shadow-lg' : ''} ${
                badge === 'Best Value' ? 'border-green-500/60' : ''
              } ${isEnterprise ? 'border-purple-500/40 bg-gradient-to-b from-purple-50/30 to-transparent dark:from-purple-950/20' : ''}`}
            >
              {badge && (
                <div className='absolute -top-3 left-1/2 -translate-x-1/2'>
                  <Badge className={`px-3 text-xs ${BADGE_STYLES[badge] ?? 'bg-primary text-primary-foreground'}`}>
                    {badge}
                  </Badge>
                </div>
              )}

              <CardHeader>
                <div className='flex items-center gap-3'>
                  <div className={`p-2 rounded-lg ${isEnterprise ? 'bg-purple-100 dark:bg-purple-900/30' : 'bg-primary/10'}`}>
                    <Icon className={`h-5 w-5 ${isEnterprise ? 'text-purple-600 dark:text-purple-400' : 'text-primary'}`} />
                  </div>
                  <div>
                    <CardTitle className='leading-tight'>{plan.label}</CardTitle>
                    <CardDescription className='text-xs mt-0.5'>{plan.description}</CardDescription>
                  </div>
                </div>

                <div className='mt-4'>
                  {isEnterprise ? (
                    <div>
                      <span className='text-2xl font-bold'>Custom Pricing</span>
                      <p className='text-xs text-muted-foreground mt-1'>Contact us for a quote</p>
                    </div>
                  ) : (
                    <div>
                      <span className='text-4xl font-bold'>
                        PKR {plan.pricePerMonth?.toLocaleString()}
                      </span>
                      <span className='text-muted-foreground text-sm'> / month</span>
                      <p className='text-xs text-muted-foreground mt-1'>Billed monthly via bank transfer</p>
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent className='flex-1'>
                <ul className='space-y-2'>
                  {plan.features?.map((feature: string) => (
                    <li key={feature} className='flex items-start gap-2 text-sm'>
                      <Check className={`h-4 w-4 mt-0.5 shrink-0 ${isEnterprise ? 'text-purple-500' : 'text-green-500'}`} />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                {isCurrentPlan && usageData?.subscription?.status === 'active' ? (
                  <Button className='w-full' variant='outline' disabled>
                    Current Plan
                  </Button>
                ) : isEnterprise ? (
                  <Button className='w-full gap-2 bg-purple-600 hover:bg-purple-700 text-white' asChild>
                    <a href='https://wa.me/923211626195' target='_blank' rel='noreferrer'>
                      <Phone className='h-4 w-4' />
                      Contact Sales
                    </a>
                  </Button>
                ) : (
                  <Button className='w-full' asChild>
                    <Link
                      to='/subscription/payment'
                      search={{ planType: plan.planType as 'single' | 'multi' | 'starter' | 'growth' | 'business' | 'enterprise' }}
                    >
                      {currentPlan && currentPlan !== 'trial' ? 'Upgrade' : 'Get Started'}
                    </Link>
                  </Button>
                )}
              </CardFooter>
            </Card>
          )
        })}
      </div>

      {/* How it works */}
      <div className='max-w-2xl mx-auto space-y-4 pt-4'>
        <h2 className='text-xl font-semibold text-center'>How does payment work?</h2>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4 text-center'>
          {[
            { step: '1', title: 'Buy Plan',       desc: 'Choose a plan and number of months.' },
            { step: '2', title: 'Bank Transfer',  desc: 'Transfer the exact amount to our bank account.' },
            { step: '3', title: 'Activate',       desc: 'Submit proof. We activate within 24 hours.' },
          ].map(({ step, title, desc }) => (
            <div key={step} className='p-4 rounded-lg border bg-muted/30'>
              <div className='w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold flex items-center justify-center mx-auto mb-2 text-sm'>
                {step}
              </div>
              <p className='font-medium text-sm'>{title}</p>
              <p className='text-xs text-muted-foreground mt-1'>{desc}</p>
            </div>
          ))}
        </div>

        <div className='text-center pt-2'>
          <Button variant='outline' asChild>
            <Link to='/subscription/payment' search={{ planType: undefined }}>Proceed to Payment</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
