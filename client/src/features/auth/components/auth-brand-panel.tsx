import {
  BarChart3,
  Globe,
  Package,
  Rocket,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/** What the product actually does — no invented claims. */
const FEATURES = [
  {
    icon: ShoppingCart,
    title: 'POS & Billing',
    body: 'Fast and easy sales',
    tile: 'bg-blue-500/15 text-blue-600 dark:bg-blue-400/20 dark:text-blue-300',
  },
  {
    icon: Package,
    title: 'Inventory',
    body: 'Track your stock',
    tile: 'bg-emerald-500/15 text-emerald-600 dark:bg-emerald-400/20 dark:text-emerald-300',
  },
  {
    icon: BarChart3,
    title: 'Accounting',
    body: 'Complete reports',
    tile: 'bg-violet-500/15 text-violet-600 dark:bg-violet-400/20 dark:text-violet-300',
  },
  {
    icon: Users,
    title: 'Customer & Supplier',
    body: 'Manage relationships',
    tile: 'bg-amber-500/15 text-amber-600 dark:bg-amber-400/20 dark:text-amber-300',
  },
  {
    icon: Share2,
    title: 'Multi-Branch',
    body: 'Grow without limits',
    tile: 'bg-cyan-500/15 text-cyan-600 dark:bg-cyan-400/20 dark:text-cyan-300',
  },
  {
    icon: Sparkles,
    title: 'AI Insights',
    body: 'Smarter decisions',
    tile: 'bg-pink-500/15 text-pink-600 dark:bg-pink-400/20 dark:text-pink-300',
  },
]

const TRUST = [
  { icon: ShieldCheck, title: 'Secure & Reliable', body: 'Your data is always safe' },
  { icon: Globe, title: 'Access Anywhere', body: 'Desktop, mobile, offline' },
  { icon: Rocket, title: 'Built for Growth', body: 'Small shops to large chains' },
]

/**
 * A stylised view of the product, drawn rather than screenshotted so it stays crisp
 * at any size and never goes stale when the dashboard changes.
 */
function DashboardIllustration() {
  return (
    <svg
      viewBox='0 0 440 268'
      className='h-auto w-full'
      role='img'
      aria-label='Illustration of the Logix Plus dashboard'
    >
      <defs>
        <linearGradient id='auth-bar' x1='0' y1='1' x2='0' y2='0'>
          <stop offset='0%' stopColor='#22d3ee' stopOpacity='0.55' />
          <stop offset='100%' stopColor='#60a5fa' />
        </linearGradient>
        <linearGradient id='auth-card' x1='0' y1='0' x2='1' y2='1'>
          <stop offset='0%' stopColor='#ffffff' stopOpacity='0.14' />
          <stop offset='100%' stopColor='#ffffff' stopOpacity='0.05' />
        </linearGradient>
        <linearGradient id='auth-trend' x1='0' y1='0' x2='1' y2='0'>
          <stop offset='0%' stopColor='#34d399' />
          <stop offset='100%' stopColor='#22d3ee' />
        </linearGradient>
      </defs>

      {/* main window */}
      <rect x='16' y='24' width='368' height='214' rx='16' fill='url(#auth-card)' />
      <rect
        x='16.5'
        y='24.5'
        width='367'
        height='213'
        rx='15.5'
        fill='none'
        stroke='#ffffff'
        strokeOpacity='0.18'
      />
      <circle cx='36' cy='44' r='3.5' fill='#ffffff' fillOpacity='0.35' />
      <circle cx='48' cy='44' r='3.5' fill='#ffffff' fillOpacity='0.22' />
      <circle cx='60' cy='44' r='3.5' fill='#ffffff' fillOpacity='0.22' />

      {/* side rail */}
      <rect x='16' y='60' width='74' height='178' fill='#ffffff' fillOpacity='0.05' />
      {[78, 100, 122, 144, 166].map((y, i) => (
        <g key={y}>
          <rect x='30' y={y} width='10' height='10' rx='3' fill='#ffffff' fillOpacity={i === 0 ? '0.75' : '0.3'} />
          <rect x='46' y={y + 2} width={i === 0 ? 30 : 26} height='6' rx='3' fill='#ffffff' fillOpacity={i === 0 ? '0.6' : '0.22'} />
        </g>
      ))}

      {/* KPI row */}
      <rect x='104' y='72' width='80' height='40' rx='9' fill='#ffffff' fillOpacity='0.09' />
      <rect x='114' y='82' width='30' height='5' rx='2.5' fill='#ffffff' fillOpacity='0.35' />
      <rect x='114' y='94' width='46' height='8' rx='4' fill='#7dd3fc' fillOpacity='0.9' />
      <rect x='192' y='72' width='80' height='40' rx='9' fill='#ffffff' fillOpacity='0.09' />
      <rect x='202' y='82' width='24' height='5' rx='2.5' fill='#ffffff' fillOpacity='0.35' />
      <rect x='202' y='94' width='40' height='8' rx='4' fill='#6ee7b7' fillOpacity='0.9' />
      <rect x='280' y='72' width='88' height='40' rx='9' fill='#ffffff' fillOpacity='0.09' />
      <rect x='290' y='82' width='28' height='5' rx='2.5' fill='#ffffff' fillOpacity='0.35' />
      <rect x='290' y='94' width='52' height='8' rx='4' fill='#c4b5fd' fillOpacity='0.9' />

      {/* chart */}
      <rect x='104' y='124' width='264' height='100' rx='10' fill='#ffffff' fillOpacity='0.06' />
      {[
        { x: 120, h: 34 },
        { x: 152, h: 52 },
        { x: 184, h: 42 },
        { x: 216, h: 66 },
        { x: 248, h: 56 },
        { x: 280, h: 74 },
        { x: 312, h: 62 },
        { x: 344, h: 82 },
      ].map((bar) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={210 - bar.h}
          width='14'
          height={bar.h}
          rx='4'
          fill='url(#auth-bar)'
        />
      ))}
      <path
        d='M127 168 L159 152 L191 160 L223 136 L255 144 L287 126 L319 134 L351 116'
        fill='none'
        stroke='url(#auth-trend)'
        strokeWidth='2.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <circle cx='351' cy='116' r='4.5' fill='#34d399' />

      {/* floating receipt card */}
      <g>
        <rect x='300' y='16' width='124' height='58' rx='12' fill='#0f1c36' />
        <rect
          x='300.5'
          y='16.5'
          width='123'
          height='57'
          rx='11.5'
          fill='none'
          stroke='#ffffff'
          strokeOpacity='0.22'
        />
        <circle cx='322' cy='45' r='12' fill='#22c55e' fillOpacity='0.2' />
        <path
          d='M317 45 l3.5 3.5 L328 41'
          fill='none'
          stroke='#4ade80'
          strokeWidth='2.4'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
        <rect x='342' y='36' width='62' height='6' rx='3' fill='#ffffff' fillOpacity='0.55' />
        <rect x='342' y='48' width='40' height='6' rx='3' fill='#ffffff' fillOpacity='0.28' />
      </g>

      {/* floating stock pill */}
      <g>
        <rect x='0' y='188' width='132' height='52' rx='12' fill='#0f1c36' />
        <rect
          x='0.5'
          y='188.5'
          width='131'
          height='51'
          rx='11.5'
          fill='none'
          stroke='#ffffff'
          strokeOpacity='0.22'
        />
        <rect x='14' y='204' width='20' height='20' rx='6' fill='#38bdf8' fillOpacity='0.25' />
        <path
          d='M19 214 h10 M24 209 v10'
          stroke='#7dd3fc'
          strokeWidth='2.2'
          strokeLinecap='round'
        />
        <rect x='44' y='205' width='68' height='6' rx='3' fill='#ffffff' fillOpacity='0.55' />
        <rect x='44' y='217' width='44' height='6' rx='3' fill='#ffffff' fillOpacity='0.28' />
      </g>
    </svg>
  )
}

/** The dashboard illustration framed like a device screen, so it reads on a light
 *  page background the same way it did floating on the old all-navy panel. */
function DeviceMockup() {
  return (
    <div className='mx-auto w-full max-w-[380px] rounded-2xl bg-[#0b1224] p-3 shadow-2xl shadow-indigo-950/25 ring-1 ring-black/10 dark:shadow-black/40'>
      <DashboardIllustration />
    </div>
  )
}

/**
 * The left half of every auth screen: who this is, what it does, and a look at the
 * product. Hidden below `lg`, where the form alone owns the screen.
 */
export function AuthBrandPanel() {
  return (
    <aside className='relative hidden overflow-hidden bg-[linear-gradient(165deg,#eef2ff_0%,#f5f7ff_45%,#eff6ff_100%)] dark:bg-[linear-gradient(155deg,#050508_0%,#0c0e18_48%,#161a2c_100%)] lg:flex lg:flex-col'>
      {/* depth: two soft light sources + a faint grid — neutral enough to read on
          both the light gradient and the dark navy one above */}
      <div
        className='pointer-events-none absolute -top-32 -right-24 h-80 w-80 rounded-full bg-indigo-400/25 blur-3xl'
        aria-hidden
      />
      <div
        className='pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-blue-400/25 blur-3xl'
        aria-hidden
      />
      <div
        className='pointer-events-none absolute inset-0 opacity-[0.05] dark:opacity-[0.06]'
        style={{
          backgroundImage:
            'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
        aria-hidden
      />

      <div className='relative flex h-full flex-col gap-6 p-10 text-slate-400 [@media(max-height:820px)]:gap-5 [@media(max-height:820px)]:p-8 xl:p-14'>
        <div className='flex items-start justify-between gap-4 text-current'>
          <div className='flex items-center gap-3'>
            {/* The logo ships with a white background baked in, so it is framed as a tile
                on purpose rather than floated on the gradient. */}
            <img
              src='/images/logo-light.png'
              alt=''
              className='h-11 w-11 rounded-xl bg-white object-contain p-1 shadow-lg shadow-slate-900/10 dark:shadow-black/20'
              aria-hidden
            />
            <div className='leading-tight'>
              <p className='text-base font-semibold text-slate-900 dark:text-white'>Logix Plus</p>
              <p className='text-xs text-slate-500 dark:text-sky-200/70'>Software Solutions</p>
            </div>
          </div>

          <div className='hidden text-right xl:block'>
            <p className='font-serif text-sm leading-snug text-indigo-600 italic dark:text-sky-300'>
              Smart Software
              <br />
              for a Better Tomorrow
            </p>
            <svg width='140' height='10' viewBox='0 0 140 10' className='ml-auto mt-0.5 text-indigo-400 dark:text-sky-400' aria-hidden>
              <path d='M2 6 Q 20 0, 38 6 T 74 6 T 110 6 T 138 6' stroke='currentColor' strokeWidth='1.5' fill='none' strokeLinecap='round' />
            </svg>
          </div>
        </div>

        <div className='flex flex-1 flex-col justify-center gap-6'>
          <div className='space-y-3'>
            <h2 className='text-3xl leading-tight font-semibold text-slate-900 xl:text-[2.1rem] dark:text-white'>
              Run your whole business from{' '}
              <span className='bg-gradient-to-r from-indigo-600 via-blue-600 to-violet-600 bg-clip-text text-transparent dark:from-sky-300 dark:via-blue-300 dark:to-indigo-300'>
                one powerful platform
              </span>
              .
            </h2>
            <p className='max-w-md text-sm text-slate-500 dark:text-sky-100/75'>
              Billing, inventory, accounts and reports for shops, wholesalers and
              schools — on your desktop, your phone, and offline.
            </p>
          </div>

          <div className='grid grid-cols-2 gap-x-5 gap-y-4'>
            {FEATURES.map((feature) => (
              <div key={feature.title} className='flex items-start gap-2.5'>
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', feature.tile)}>
                  <feature.icon className='h-4.5 w-4.5' aria-hidden />
                </span>
                <div className='min-w-0'>
                  <p className='text-sm font-medium text-slate-900 dark:text-white'>{feature.title}</p>
                  <p className='text-xs text-slate-500 dark:text-sky-100/65'>{feature.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className='hidden [@media(min-height:800px)]:block'>
            <DeviceMockup />
          </div>
        </div>

        <div className='grid grid-cols-3 gap-4 border-t border-slate-900/10 pt-5 text-xs [@media(max-height:700px)]:hidden dark:border-white/10'>
          {TRUST.map((item) => (
            <div key={item.title} className='flex items-start gap-2'>
              <item.icon className='h-4 w-4 shrink-0 text-indigo-500 dark:text-sky-300' aria-hidden />
              <div className='min-w-0'>
                <p className='font-medium text-slate-800 dark:text-white'>{item.title}</p>
                <p className='text-slate-500 dark:text-sky-100/60'>{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
