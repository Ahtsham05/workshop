import { ArrowRight, Mail, MessageCircle, Phone } from "lucide-react";
import { EMAIL, PHONE_DISPLAY, PHONE_TEL, SIGNUP_URL, TRIAL_DAYS, whatsappLink } from "@/lib/site";

export default function FinalCta({
  title = "Every day without a system costs you money.",
  highlight = "Start fixing it today.",
  showPhone = true,
}: {
  title?: string;
  highlight?: string;
  /** International pages hide the Pakistani phone number and lead with WhatsApp and email. */
  showPhone?: boolean;
}) {
  const contacts = [
    { icon: MessageCircle, label: "WhatsApp", value: "Chat with sales", href: whatsappLink(), external: true },
    ...(showPhone ? [{ icon: Phone, label: "Call us", value: PHONE_DISPLAY, href: `tel:${PHONE_TEL}` }] : []),
    { icon: Mail, label: "Email", value: EMAIL, href: `mailto:${EMAIL}?subject=Logix%20Plus%20enquiry` },
  ];

  return (
    <section id="contact" className="hero-bg relative overflow-hidden py-20 lg:py-28">
      <div className="dot-grid pointer-events-none absolute inset-0 opacity-30" aria-hidden />
      <div className="relative mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="reveal text-balance text-3xl font-extrabold leading-[1.15] tracking-tight text-white sm:text-4xl md:text-5xl">
          {title} <span className="text-gradient-light">{highlight}</span>
        </h2>
        <p className="reveal mx-auto mt-6 max-w-2xl text-lg text-slate-300">
          Try Logix Plus free for {TRIAL_DAYS} days, or let us walk you through it on a free demo call. We&apos;ll help you
          import your products and get your team billing.
        </p>
        <div className="reveal mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <a href={SIGNUP_URL} className="btn btn-brand group px-8 py-4 text-base">
            Start free trial
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
          </a>
          <a href={whatsappLink()} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp px-8 py-4 text-base">
            <MessageCircle className="h-5 w-5" />
            Get a free demo on WhatsApp
          </a>
        </div>

        <div className={`mx-auto mt-14 grid grid-cols-1 gap-4 ${contacts.length === 3 ? "sm:grid-cols-3" : "max-w-2xl sm:grid-cols-2"}`}>
          {contacts.map(({ icon: I, label, value, href, external }) => (
            <a
              key={label}
              href={href}
              target={external ? "_blank" : undefined}
              rel={external ? "noopener noreferrer" : undefined}
              className="reveal min-w-0 rounded-2xl border border-white/10 bg-white/[0.05] p-5 text-left transition-colors hover:border-cyan-400/40"
            >
              <I className="mb-3 h-5 w-5 text-cyan-300" />
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
              <p className="mt-1 break-words font-semibold text-white">{value}</p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
