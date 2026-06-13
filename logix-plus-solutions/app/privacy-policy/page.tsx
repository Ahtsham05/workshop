import type { Metadata } from "next";
import LegalPageLayout from "@/components/LegalPageLayout";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy Policy for Logix Plus Solutions — how we collect, use, and protect your data, including Meta/Facebook and WhatsApp Business integrations.",
  alternates: {
    canonical: "/privacy-policy",
  },
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "13 June 2026";

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <p>
        This Privacy Policy describes how <strong>Logix Plus Solutions</strong> (&quot;we&quot;,
        &quot;us&quot;, or &quot;our&quot;) collects, uses, stores, and shares information when you
        use our website at{" "}
        <a href="https://logixplussolutions.com">logixplussolutions.com</a>, our business
        application at{" "}
        <a href="https://app.logixplussolutions.com">app.logixplussolutions.com</a>, and related
        products and services (collectively, the &quot;Services&quot;).
      </p>
      <p>
        We are committed to protecting your privacy and complying with applicable data protection
        laws, including where relevant the EU General Data Protection Regulation (GDPR) and Meta
        Platform Terms for apps integrated with Facebook, Instagram, and WhatsApp.
      </p>

      <h2>1. Who we are</h2>
      <p>
        <strong>Data controller:</strong> Logix Plus Solutions
        <br />
        <strong>Website:</strong>{" "}
        <a href="https://logixplussolutions.com">https://logixplussolutions.com</a>
        <br />
        <strong>Application:</strong>{" "}
        <a href="https://app.logixplussolutions.com">https://app.logixplussolutions.com</a>
        <br />
        <strong>Contact email:</strong>{" "}
        <a href="mailto:info@logixplussolutions.com">info@logixplussolutions.com</a>
        <br />
        <strong>Privacy inquiries:</strong>{" "}
        <a href="mailto:ahtshamyounas0321@gmail.com">ahtshamyounas0321@gmail.com</a>
      </p>

      <h2>2. Information we collect</h2>
      <h3>2.1 Information you provide directly</h3>
      <ul>
        <li>
          <strong>Account information:</strong> name, email address, phone number, password
          (stored in hashed form), organization name, branch details, and role/permissions.
        </li>
        <li>
          <strong>Business data:</strong> customers, suppliers, products, invoices, payments,
          inventory, employees, and other records you enter into the Services.
        </li>
        <li>
          <strong>Communications:</strong> messages you send to our support team or via contact
          forms.
        </li>
        <li>
          <strong>Billing information:</strong> subscription plan details and payment-related
          metadata processed by our payment providers (we do not store full card numbers on our
          servers).
        </li>
      </ul>

      <h3>2.2 Information collected automatically</h3>
      <ul>
        <li>
          <strong>Device and usage data:</strong> IP address, browser type, operating system,
          pages viewed, features used, timestamps, and error logs.
        </li>
        <li>
          <strong>Cookies and similar technologies:</strong> session cookies and preferences to
          keep you signed in and to improve performance. See Section 8.
        </li>
      </ul>

      <h3>2.3 Information from Meta (Facebook) platforms</h3>
      <p>
        When you or your organization connects WhatsApp Business, Facebook Login, or other Meta
        integrations through our app (<strong>Logix Plus Solutions</strong>, Meta App ID{" "}
        <strong>1620421349065765</strong>), we may receive information from Meta as permitted by
        your authorization and Meta&apos;s policies, including:
      </p>
      <ul>
        <li>
          Meta user ID and basic profile information (such as name and email) when you authenticate
          via Facebook Login for Business.
        </li>
        <li>
          WhatsApp Business Account (WABA) ID, phone number ID, display phone number, and business
          profile details required to operate WhatsApp Cloud API messaging.
        </li>
        <li>
          OAuth access tokens and related credentials (stored encrypted) needed to send and receive
          WhatsApp messages on your behalf.
        </li>
        <li>
          WhatsApp message content, delivery status, template metadata, and conversation data when
          you use our WhatsApp inbox and messaging features.
        </li>
      </ul>
      <p>
        We only request permissions necessary to provide the connected features. We do not sell Meta
        platform data to third parties.
      </p>

      <h2>3. How we use your information</h2>
      <p>We use collected information to:</p>
      <ul>
        <li>Provide, operate, maintain, and improve the Services.</li>
        <li>Create and manage user accounts and organizations.</li>
        <li>Process business transactions you record (sales, purchases, reports, etc.).</li>
        <li>
          Enable WhatsApp Business messaging, templates, and inbox features you configure.
        </li>
        <li>Authenticate users and prevent fraud, abuse, and unauthorized access.</li>
        <li>Provide customer support and respond to inquiries.</li>
        <li>Send service-related notices (e.g., security alerts, account updates).</li>
        <li>Comply with legal obligations and enforce our Terms and Conditions.</li>
        <li>Analyze aggregated, de-identified usage to improve product quality.</li>
      </ul>

      <h2>4. Legal basis for processing (EEA/UK users)</h2>
      <p>Where GDPR applies, we process personal data based on:</p>
      <ul>
        <li>
          <strong>Contract:</strong> to deliver the Services you or your organization subscribed to.
        </li>
        <li>
          <strong>Legitimate interests:</strong> security, fraud prevention, product improvement,
          and support — balanced against your rights.
        </li>
        <li>
          <strong>Consent:</strong> where required, e.g., optional marketing or non-essential
          cookies.
        </li>
        <li>
          <strong>Legal obligation:</strong> tax, accounting, or regulatory requirements.
        </li>
      </ul>

      <h2>5. How we share information</h2>
      <p>We may share information with:</p>
      <ul>
        <li>
          <strong>Service providers:</strong> cloud hosting, database, email, analytics, and
          payment processors who process data on our instructions under confidentiality agreements.
        </li>
        <li>
          <strong>Meta Platforms, Inc.:</strong> when you use Facebook Login, WhatsApp Business API,
          or related Meta integrations, data flows between our Services and Meta as described in
          Meta&apos;s terms and your app permissions.
        </li>
        <li>
          <strong>Your organization:</strong> users within the same organization/branch may access
          data according to assigned roles and permissions.
        </li>
        <li>
          <strong>Legal requirements:</strong> when required by law, court order, or to protect
          rights, safety, and security.
        </li>
        <li>
          <strong>Business transfers:</strong> in connection with a merger, acquisition, or sale of
          assets, with notice where required by law.
        </li>
      </ul>
      <p>We do not sell your personal information.</p>

      <h2>6. Data retention</h2>
      <p>
        We retain personal data for as long as your account is active or as needed to provide the
        Services, comply with legal obligations, resolve disputes, and enforce agreements.
      </p>
      <ul>
        <li>
          Account and business records are retained while your subscription is active and for a
          reasonable period afterward unless you request deletion.
        </li>
        <li>
          WhatsApp tokens and connection metadata are retained while the integration is active and
          deleted or revoked when you disconnect WhatsApp or delete your account.
        </li>
        <li>
          Logs and backups may be retained for a limited period for security and disaster recovery.
        </li>
      </ul>

      <h2>7. Data security</h2>
      <p>
        We implement appropriate technical and organizational measures including encrypted
        connections (HTTPS/TLS), encrypted storage of sensitive tokens, access controls,
        role-based permissions, and regular security reviews. No method of transmission or storage is
        100% secure; we cannot guarantee absolute security.
      </p>

      <h2>8. Cookies</h2>
      <p>
        Our website and application use essential cookies for authentication and session management.
        We may use analytics cookies to understand usage patterns. You can control non-essential
        cookies through your browser settings. Disabling essential cookies may limit functionality.
      </p>

      <h2>9. Your rights</h2>
      <p>Depending on your location, you may have the right to:</p>
      <ul>
        <li>Access the personal data we hold about you.</li>
        <li>Correct inaccurate or incomplete data.</li>
        <li>Request deletion of your data (see our Data Deletion page).</li>
        <li>Restrict or object to certain processing.</li>
        <li>Data portability where applicable.</li>
        <li>Withdraw consent where processing is consent-based.</li>
        <li>Lodge a complaint with a supervisory authority.</li>
      </ul>
      <p>
        To exercise these rights, contact us at{" "}
        <a href="mailto:info@logixplussolutions.com">info@logixplussolutions.com</a>. We respond
        within 30 days where required by law.
      </p>

      <h2>10. Data deletion</h2>
      <p>
        You may request deletion of your account and associated personal data. For Meta/Facebook
        related data deletion instructions, see our dedicated page:{" "}
        <a href="/data-deletion">Data Deletion Instructions</a>.
      </p>
      <p>
        When you delete your account, we will delete or anonymize personal data within a reasonable
        timeframe, except where retention is required by law or for legitimate business purposes
        (e.g., completed transaction records for tax compliance).
      </p>

      <h2>11. Meta platform data — additional terms</h2>
      <p>
        If you use features powered by Meta platforms, you also agree to Meta&apos;s applicable
        terms, including the{" "}
        <a
          href="https://developers.facebook.com/terms/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Meta Platform Terms
        </a>
        ,{" "}
        <a
          href="https://www.facebook.com/privacy/policy/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Meta Privacy Policy
        </a>
        , and{" "}
        <a
          href="https://www.whatsapp.com/legal/business-terms"
          target="_blank"
          rel="noopener noreferrer"
        >
          WhatsApp Business Terms
        </a>
        . You may revoke our access to your Meta data at any time through your Facebook/WhatsApp
        account settings or by disconnecting the integration in our app under Settings → WhatsApp.
      </p>

      <h2>12. International data transfers</h2>
      <p>
        Your information may be processed in Pakistan and other countries where we or our service
        providers operate. Where required, we use appropriate safeguards such as standard
        contractual clauses for transfers from the EEA/UK.
      </p>

      <h2>13. Children&apos;s privacy</h2>
      <p>
        The Services are intended for businesses and users aged 18 and over. We do not knowingly
        collect personal information from children under 16. If you believe a child has provided us
        data, contact us and we will delete it promptly.
      </p>

      <h2>14. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will post the revised policy on
        this page with an updated &quot;Last updated&quot; date. Material changes may be notified
        by email or in-app notice. Continued use after changes constitutes acceptance.
      </p>

      <h2>15. Contact us</h2>
      <p>
        For privacy questions, data requests, or complaints:
        <br />
        <strong>Logix Plus Solutions</strong>
        <br />
        Email:{" "}
        <a href="mailto:info@logixplussolutions.com">info@logixplussolutions.com</a>
        <br />
        Privacy contact:{" "}
        <a href="mailto:ahtshamyounas0321@gmail.com">ahtshamyounas0321@gmail.com</a>
      </p>
    </LegalPageLayout>
  );
}
