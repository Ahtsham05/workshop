import type { Metadata } from "next";
import LegalPageLayout from "@/components/LegalPageLayout";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description:
    "Terms and Conditions for using Logix Plus Solutions business software, website, and Meta/WhatsApp integrations.",
  alternates: {
    canonical: "/terms-and-conditions",
  },
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "13 June 2026";

export default function TermsAndConditionsPage() {
  return (
    <LegalPageLayout title="Terms and Conditions" lastUpdated={LAST_UPDATED}>
      <p>
        These Terms and Conditions (&quot;Terms&quot;) govern your access to and use of the
        website, web application, mobile/desktop clients, and related services provided by{" "}
        <strong>Logix Plus Solutions</strong> (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;)
        at{" "}
        <a href="https://logixplussolutions.com">logixplussolutions.com</a> and{" "}
        <a href="https://app.logixplussolutions.com">app.logixplussolutions.com</a> (collectively,
        the &quot;Services&quot;).
      </p>
      <p>
        By accessing or using the Services, creating an account, or connecting third-party
        integrations (including Meta/Facebook and WhatsApp Business), you agree to these Terms. If
        you do not agree, do not use the Services.
      </p>

      <h2>1. Definitions</h2>
      <ul>
        <li>
          <strong>Customer / You:</strong> the individual or organization registering for or using
          the Services.
        </li>
        <li>
          <strong>User:</strong> any person authorized by a Customer to access an account (staff,
          managers, administrators).
        </li>
        <li>
          <strong>Customer Data:</strong> business records and content you upload or generate
          through the Services (customers, invoices, messages, etc.).
        </li>
        <li>
          <strong>Subscription:</strong> a paid or trial plan granting access to features for a
          defined period.
        </li>
      </ul>

      <h2>2. Eligibility and account registration</h2>
      <ul>
        <li>You must be at least 18 years old and have authority to bind your organization.</li>
        <li>
          You must provide accurate, complete registration information and keep it up to date.
        </li>
        <li>
          You are responsible for safeguarding login credentials and all activity under your
          account.
        </li>
        <li>
          Notify us immediately at{" "}
          <a href="mailto:info@logixplussolutions.com">info@logixplussolutions.com</a> of any
          unauthorized access.
        </li>
      </ul>

      <h2>3. Description of Services</h2>
      <p>
        Logix Plus Solutions provides cloud-based business management software including, depending
        on your plan: point of sale, inventory, invoicing, accounting reports, customer/supplier
        management, mobile shop features (load, wallet, repair, etc.), school management, WhatsApp
        Business messaging integration, and related tools.
      </p>
      <p>
        We may modify, add, or remove features with reasonable notice where practicable. Beta or
        experimental features are provided &quot;as is&quot; without warranty.
      </p>

      <h2>4. Subscriptions, fees, and payment</h2>
      <ul>
        <li>
          Paid features require an active Subscription. Fees, billing cycles, and plan limits are
          shown at signup or in your account dashboard.
        </li>
        <li>
          Unless stated otherwise, subscriptions renew automatically until cancelled.
        </li>
        <li>
          Fees are non-refundable except where required by law or explicitly stated in your plan
          terms.
        </li>
        <li>
          We may suspend access for overdue payments after reasonable notice.
        </li>
      </ul>

      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Services for unlawful, fraudulent, or harmful purposes.</li>
        <li>Violate any applicable law, regulation, or third-party rights.</li>
        <li>
          Send spam, unsolicited messages, or content that violates WhatsApp or Meta policies when
          using integrated messaging features.
        </li>
        <li>
          Attempt to gain unauthorized access, probe vulnerabilities, or interfere with the
          Services or other users.
        </li>
        <li>Reverse engineer, copy, or resell the Services except as expressly permitted.</li>
        <li>Upload malware, abusive content, or data you do not have rights to use.</li>
        <li>Misrepresent your identity or affiliation.</li>
      </ul>
      <p>
        We may suspend or terminate accounts that violate these rules or pose security or legal
        risk.
      </p>

      <h2>6. Customer Data and privacy</h2>
      <p>
        You retain ownership of Customer Data. You grant us a limited license to host, process,
        transmit, and display Customer Data solely to provide and improve the Services, comply with
        law, and as described in our{" "}
        <a href="/privacy-policy">Privacy Policy</a>.
      </p>
      <p>
        You are responsible for obtaining necessary consents from your customers, employees, and
        contacts whose data you store or message through the Services, including WhatsApp and SMS
        communications.
      </p>

      <h2>7. Third-party services and Meta integrations</h2>
      <p>
        The Services may integrate with third-party platforms including{" "}
        <strong>Meta (Facebook, WhatsApp Business API)</strong>, payment gateways, and cloud
        providers. Your use of those integrations is subject to their terms and policies in
        addition to these Terms.
      </p>
      <p>
        When you connect WhatsApp Business or Facebook Login through our Meta app (
        <strong>Logix Plus Solutions</strong>, App ID <strong>1620421349065765</strong>):
      </p>
      <ul>
        <li>
          You authorize us to access Meta data necessary to provide messaging and authentication
          features you enable.
        </li>
        <li>
          You must comply with Meta Platform Terms, WhatsApp Business Messaging Policy, and
          applicable commerce policies.
        </li>
        <li>
          You may disconnect integrations at any time; we are not responsible for third-party
          outages or policy changes.
        </li>
      </ul>

      <h2>8. Intellectual property</h2>
      <p>
        The Services, including software, design, logos, documentation, and trademarks, are owned by
        Logix Plus Solutions or its licensors. These Terms do not grant you ownership rights — only a
        limited, non-exclusive, non-transferable license to use the Services during an active
        Subscription.
      </p>
      <p>
        Feedback you provide may be used by us without obligation or compensation.
      </p>

      <h2>9. Confidentiality</h2>
      <p>
        Each party agrees to protect the other&apos;s confidential information with reasonable care
        and use it only for purposes related to the Services. This does not apply to information
        that is public, independently developed, or lawfully obtained from third parties.
      </p>

      <h2>10. Service availability and support</h2>
      <p>
        We strive for high availability but do not guarantee uninterrupted access. Scheduled
        maintenance, updates, and events beyond our control (including internet or Meta platform
        outages) may cause temporary downtime. Support channels and response times depend on your
        plan.
      </p>

      <h2>11. Disclaimer of warranties</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICES ARE PROVIDED &quot;AS IS&quot; AND
        &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR
        STATUTORY, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
        PURPOSE, AND NON-INFRINGEMENT.
      </p>
      <p>
        We do not warrant that the Services will be error-free, secure, or meet all your business
        requirements. You are responsible for verifying reports, tax calculations, and compliance
        with local regulations.
      </p>

      <h2>12. Limitation of liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, LOGIX PLUS SOLUTIONS AND ITS OFFICERS, EMPLOYEES,
        AND AFFILIATES SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
        PUNITIVE DAMAGES, OR LOSS OF PROFITS, REVENUE, DATA, OR GOODWILL, ARISING FROM YOUR USE OF
        THE SERVICES.
      </p>
      <p>
        OUR TOTAL LIABILITY FOR ANY CLAIM ARISING FROM THESE TERMS OR THE SERVICES SHALL NOT EXCEED
        THE AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS BEFORE THE CLAIM, OR ONE HUNDRED US
        DOLLARS (USD 100), WHICHEVER IS GREATER.
      </p>
      <p>
        Some jurisdictions do not allow certain limitations; in those cases, our liability is
        limited to the fullest extent permitted by law.
      </p>

      <h2>13. Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless Logix Plus Solutions from claims, damages, losses,
        and expenses (including reasonable legal fees) arising from your use of the Services, your
        Customer Data, violation of these Terms, or violation of third-party rights or Meta/WhatsApp
        policies.
      </p>

      <h2>14. Termination</h2>
      <ul>
        <li>You may cancel your Subscription or close your account at any time via account settings or by contacting support.</li>
        <li>
          We may suspend or terminate access for breach of these Terms, non-payment, legal
          requirement, or extended inactivity, with notice where reasonable.
        </li>
        <li>
          Upon termination, your right to use the Services ends. We may delete Customer Data after a
          retention period as described in our Privacy Policy and{" "}
          <a href="/data-deletion">Data Deletion Instructions</a>.
        </li>
        <li>Sections that by nature should survive (liability, indemnity, governing law) will survive termination.</li>
      </ul>

      <h2>15. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of <strong>Pakistan</strong>, without regard to
        conflict-of-law principles. Courts in Pakistan shall have exclusive jurisdiction, except
        where mandatory consumer protection laws in your country require otherwise.
      </p>
      <p>
        Before formal proceedings, parties agree to attempt good-faith resolution by contacting{" "}
        <a href="mailto:info@logixplussolutions.com">info@logixplussolutions.com</a>.
      </p>

      <h2>16. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. The revised version will be posted on this page
        with an updated date. Material changes may be communicated by email or in-app notice.
        Continued use after the effective date constitutes acceptance.
      </p>

      <h2>17. Contact</h2>
      <p>
        <strong>Logix Plus Solutions</strong>
        <br />
        Email:{" "}
        <a href="mailto:info@logixplussolutions.com">info@logixplussolutions.com</a>
        <br />
        Website:{" "}
        <a href="https://logixplussolutions.com">https://logixplussolutions.com</a>
        <br />
        Application:{" "}
        <a href="https://app.logixplussolutions.com">https://app.logixplussolutions.com</a>
      </p>
    </LegalPageLayout>
  );
}
