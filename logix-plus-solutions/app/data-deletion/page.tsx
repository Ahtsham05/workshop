import type { Metadata } from "next";
import Link from "next/link";
import {
  Shield,
  Trash2,
  Unplug,
  Mail,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  ExternalLink,
} from "lucide-react";
import LegalPageLayout from "@/components/LegalPageLayout";

export const metadata: Metadata = {
  title: "Data Deletion Instructions",
  description:
    "Official instructions to delete your Logix Plus Solutions account and Meta/Facebook/WhatsApp data. Compliant with Meta Platform data deletion requirements.",
  alternates: {
    canonical: "/data-deletion",
  },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Data Deletion Instructions | Logix Plus Solutions",
    description:
      "How to request deletion of your personal data from Logix Plus Solutions and connected Meta platforms.",
    url: "https://logixplussolutions.com/data-deletion",
  },
};

const LAST_UPDATED = "13 June 2026";
const META_APP_ID = "1620421349065765";

const deletedItems = [
  "Name, email address, and phone number on your profile",
  "Login credentials and active session tokens",
  "WhatsApp Business connection tokens and Meta OAuth credentials",
  "WhatsApp conversations and messages stored in our platform",
  "Organization settings tied exclusively to your user account",
];

const retainedItems = [
  "Anonymized usage statistics that cannot identify you",
  "Billing and tax records kept for legally required periods",
  "Data needed to resolve disputes or comply with court orders",
  "Encrypted backup copies for up to 90 days, then permanently purged",
];

function QuickActionCard({
  icon,
  title,
  description,
  href,
  external,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  external?: boolean;
  cta: string;
}) {
  const className =
    "legal-action-card flex flex-col h-full group no-underline hover:no-underline";

  const inner = (
    <>
      <div className="flex items-start gap-3 mb-3">
        <div className="p-2 rounded-lg bg-teal-50 text-teal-700 border border-teal-100">
          {icon}
        </div>
        <div>
          <h3 className="font-semibold text-stone-900 text-base m-0">{title}</h3>
        </div>
      </div>
      <p className="text-sm text-stone-600 leading-relaxed flex-1 mb-4 m-0">{description}</p>
      <span className="text-sm font-semibold text-teal-700 group-hover:text-teal-800 inline-flex items-center gap-1">
        {cta}
        {external ? <ExternalLink className="w-3.5 h-3.5" /> : null}
      </span>
    </>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {inner}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}

export default function DataDeletionPage() {
  return (
    <LegalPageLayout
      wide
      title="Data Deletion Instructions"
      subtitle="Your right to delete personal data from Logix Plus Solutions and connected Meta (Facebook / WhatsApp) integrations."
      lastUpdated={LAST_UPDATED}
      hero={
        <div className="space-y-6 not-prose">
          <div className="flex flex-wrap items-center gap-3">
            <span className="legal-badge">
              <Shield className="w-3.5 h-3.5" />
              Meta Platform compliant
            </span>
            <span className="text-xs text-stone-500">App ID: {META_APP_ID}</span>
          </div>

          <div className="surface-card p-5 md:p-6 bg-gradient-to-br from-white to-teal-50/30 border-teal-100/80">
            <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
              <div className="p-3 rounded-xl bg-teal-600 text-white shrink-0 w-fit">
                <Trash2 className="w-7 h-7" />
              </div>
              <div>
                <p className="font-serif text-lg font-semibold text-stone-900 mb-1">
                  Request complete data removal
                </p>
                <p className="text-sm text-stone-600 leading-relaxed m-0">
                  We process verified deletion requests within{" "}
                  <strong className="text-stone-800">30 days</strong>. You will receive email
                  confirmation when your data has been removed from our active systems.
                </p>
              </div>
              <div className="md:ml-auto shrink-0">
                <a
                  href="mailto:info@logixplussolutions.com?subject=Data%20Deletion%20Request"
                  className="btn-primary px-5 py-2.5 rounded-lg text-sm whitespace-nowrap inline-flex"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Request deletion
                </a>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <QuickActionCard
              icon={<Trash2 className="w-5 h-5" />}
              title="Delete full account"
              description="Permanently remove your Logix Plus profile, business access, and all linked integration data."
              href="https://app.logixplussolutions.com"
              external
              cta="Open application"
            />
            <QuickActionCard
              icon={<Unplug className="w-5 h-5" />}
              title="Disconnect WhatsApp only"
              description="Remove Meta/WhatsApp tokens without closing your Logix Plus account or other business data."
              href="https://app.logixplussolutions.com/settings/whatsapp"
              external
              cta="WhatsApp settings"
            />
            <QuickActionCard
              icon={<Mail className="w-5 h-5" />}
              title="Email our privacy team"
              description="Cannot sign in? Send a verified deletion request and we will assist you manually."
              href="mailto:info@logixplussolutions.com?subject=Data%20Deletion%20Request&body=Full%20name%3A%0ARegistered%20email%3A%0AOrganization%20name%20(if%20applicable)%3A%0AMeta%2FWhatsApp%20ID%20(if%20applicable)%3A%0A%0AI%20request%20deletion%20of%20my%20personal%20data."
              cta="Compose email"
            />
          </div>
        </div>
      }
    >
      <h2>How to delete your account</h2>
      <p>Follow these steps to request deletion of your Logix Plus Solutions account:</p>

      <div className="not-prose space-y-4 my-6">
        {[
          {
            step: 1,
            title: "Sign in to your account",
            body: (
              <>
                Go to{" "}
                <a href="https://app.logixplussolutions.com" target="_blank" rel="noopener noreferrer">
                  app.logixplussolutions.com
                </a>{" "}
                with your registered email and password.
              </>
            ),
          },
          {
            step: 2,
            title: "Open account settings",
            body: (
              <>
                Navigate to <strong>Settings → Account</strong>. If you are a staff user, contact
                your organization administrator to remove your access or delete the organization.
              </>
            ),
          },
          {
            step: 3,
            title: "Submit deletion request",
            body: (
              <>
                Select <strong>Delete account</strong>, or email{" "}
                <a href="mailto:info@logixplussolutions.com">info@logixplussolutions.com</a> with
                subject line <strong>Account Deletion Request</strong>, your registered email, and
                organization name.
              </>
            ),
          },
          {
            step: 4,
            title: "Confirmation",
            body: (
              <>
                We verify your identity and confirm deletion by email within{" "}
                <strong>30 days</strong> (or sooner where possible).
              </>
            ),
          },
        ].map(({ step, title, body }) => (
          <div key={step} className="flex gap-4 surface-card p-4 md:p-5">
            <span className="legal-step-num">{step}</span>
            <div>
              <p className="font-semibold text-stone-900 mb-1 m-0">{title}</p>
              <p className="text-sm text-stone-600 leading-relaxed m-0">{body}</p>
            </div>
          </div>
        ))}
      </div>

      <h2>What we delete</h2>
      <p>After a confirmed deletion request, we remove or irreversibly anonymize the following:</p>

      <div className="not-prose grid md:grid-cols-2 gap-4 my-6">
        <div className="surface-card p-5 border-green-200/60 bg-green-50/30">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-5 h-5 text-green-700" />
            <h3 className="font-semibold text-stone-900 text-base m-0">Removed from our systems</h3>
          </div>
          <ul className="space-y-2 m-0 p-0 list-none">
            {deletedItems.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-stone-700">
                <span className="text-green-600 shrink-0 mt-0.5">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="surface-card p-5 border-amber-200/60 bg-amber-50/20">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-amber-700" />
            <h3 className="font-semibold text-stone-900 text-base m-0">May be retained temporarily</h3>
          </div>
          <ul className="space-y-2 m-0 p-0 list-none">
            {retainedItems.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-stone-700">
                <span className="text-amber-600 shrink-0 mt-0.5">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <h2>Disconnect Meta / WhatsApp only</h2>
      <p>
        If you want to stop Meta and WhatsApp data sharing but keep using Logix Plus for other
        business features:
      </p>
      <ol>
        <li>
          In the app, open <strong>Settings → WhatsApp</strong> and click <strong>Disconnect</strong>.
        </li>
        <li>
          In{" "}
          <a
            href="https://business.facebook.com/settings/connected-apps"
            target="_blank"
            rel="noopener noreferrer"
          >
            Meta Business Settings → Connected apps
          </a>
          , remove <strong>Logix Plus Solutions</strong>.
        </li>
        <li>
          Revoke permissions at{" "}
          <a
            href="https://www.facebook.com/settings?tab=business_tools"
            target="_blank"
            rel="noopener noreferrer"
          >
            Facebook Business Integrations
          </a>
          .
        </li>
      </ol>
      <p>
        This immediately invalidates our access tokens and stops new data collection from Meta.
        Messages already stored in your account remain until you delete them or your full account.
      </p>

      <h2>Email deletion request template</h2>
      <p>If you cannot access your account, email us with the details below:</p>

      <div className="not-prose surface-card p-5 md:p-6 bg-stone-100/50 font-mono text-sm text-stone-700 leading-relaxed my-6 border-dashed">
        <p className="m-0 mb-3 text-stone-500 text-xs font-sans uppercase tracking-wide font-semibold">
          Copy &amp; send to info@logixplussolutions.com
        </p>
        <p className="m-0">To: info@logixplussolutions.com</p>
        <p className="m-0">Subject: Data Deletion Request</p>
        <br />
        <p className="m-0">Full name: [Your name]</p>
        <p className="m-0">Registered email: [Your email]</p>
        <p className="m-0">Organization: [Business name, if applicable]</p>
        <p className="m-0">Meta / WhatsApp ID: [If applicable]</p>
        <br />
        <p className="m-0">
          I request permanent deletion of all personal data associated with my Logix Plus Solutions
          account and any Meta platform data linked through your application.
        </p>
      </div>

      <h2>Meta platform data deletion callback</h2>
      <div className="not-prose surface-card p-5 md:p-6 my-4">
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-stone-700 leading-relaxed m-0">
              When you remove our app from Facebook, Meta may send an automated signed deletion
              request to our servers. We acknowledge and process these requests in accordance with{" "}
              <a
                href="https://developers.facebook.com/terms/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Meta Platform Terms
              </a>
              , typically within <strong>30 days</strong>, by deleting Meta user identifiers, OAuth
              tokens, and linked profile data from our active databases.
            </p>
          </div>
        </div>
      </div>

      <h2>Processing timeline</h2>
      <ul>
        <li>
          <strong>Verification:</strong> 1–3 business days to confirm your identity and account
          ownership.
        </li>
        <li>
          <strong>Active systems:</strong> data removed within 30 days of verified request.
        </li>
        <li>
          <strong>Backups:</strong> purged on rolling schedule, within 90 days maximum.
        </li>
        <li>
          <strong>Confirmation:</strong> email sent when deletion from production systems is
          complete.
        </li>
      </ul>

      <hr />

      <div className="not-prose surface-card p-6 md:p-8 bg-slate-900 text-stone-100 rounded-xl">
        <h3 className="font-serif text-xl font-semibold text-white mb-2 m-0">Need help?</h3>
        <p className="text-stone-300 text-sm leading-relaxed mb-5 m-0">
          Our privacy team responds to deletion and data-access requests promptly.
        </p>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3">
          <a
            href="mailto:info@logixplussolutions.com"
            className="btn-primary px-5 py-2.5 rounded-lg text-sm text-center"
          >
            info@logixplussolutions.com
          </a>
          <a
            href="mailto:ahtshamyounas0321@gmail.com"
            className="btn-outline px-5 py-2.5 rounded-lg text-sm text-center !bg-transparent !text-stone-100 !border-stone-600 hover:!bg-stone-800"
          >
            Privacy contact
          </a>
        </div>
        <div className="mt-6 pt-5 border-t border-stone-700 flex flex-wrap gap-4 text-sm">
          <Link href="/privacy-policy" className="text-teal-300 hover:text-teal-200 inline-flex items-center gap-1 no-underline">
            <FileText className="w-4 h-4" /> Privacy Policy
          </Link>
          <Link href="/terms-and-conditions" className="text-teal-300 hover:text-teal-200 inline-flex items-center gap-1 no-underline">
            <FileText className="w-4 h-4" /> Terms &amp; Conditions
          </Link>
        </div>
      </div>
    </LegalPageLayout>
  );
}
