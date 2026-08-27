import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import JsonLd from "@/components/seo/JsonLd";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vision-board.tech";

export const metadata: Metadata = {
  title: "Privacy Policy — VisionBoard",
  description: "Learn how VisionBoard collects, uses, and safeguards your personal information and project data.",
  openGraph: {
    title: "Privacy Policy — VisionBoard",
    description: "Learn how VisionBoard collects, uses, and safeguards your personal information and project data.",
    url: `${siteUrl}/privacy`,
  },
  alternates: {
    canonical: `${siteUrl}/privacy`,
  },
};

export default function PrivacyPage() {
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": siteUrl,
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Privacy Policy",
        "item": `${siteUrl}/privacy`,
      },
    ],
  };

  return (
    <div className="min-h-screen bg-offwhite flex flex-col">
      <JsonLd data={breadcrumbJsonLd} />
      <Header />

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-14 space-y-6">
        {/* Page Header */}
        <div className="space-y-2">
          <span className="text-xs font-bold tracking-wider text-blue uppercase bg-blue-faint px-3 py-1 rounded-full border border-blue-light">
            Legal
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-ink tracking-tight mt-3">
            Privacy Policy
          </h1>
          <p className="text-slate text-sm">Last updated: August 5, 2026</p>
        </div>

        <p className="text-slate text-sm leading-relaxed">
          VisionBoard (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) is committed to protecting your personal
          information. This Privacy Policy explains what data we collect, how we use it, and your rights
          regarding that data when you use our platform at{" "}
          <a href="https://vision-board.tech" className="text-blue hover:underline">
            vision-board.tech
          </a>{" "}
          (the &ldquo;Service&rdquo;).
        </p>

        <Section title="1. Information We Collect">
          We collect information you provide directly, as well as data generated through your use of
          the Service:
          <ul className="list-disc pl-5 mt-3 space-y-2 text-slate">
            <li>
              <strong className="text-ink">Account information:</strong> name, email address, and
              profile picture provided during registration or OAuth sign-in.
            </li>
            <li>
              <strong className="text-ink">Workspace data:</strong> goals, milestones, sprints, tasks,
              board items, and documents you create within the Service.
            </li>
            <li>
              <strong className="text-ink">AI interaction data:</strong> prompts submitted to AI
              features (roadmap generator, goal deconstructor, natural language board editing) and
              the responses generated. These are stored in an AI generation log.
            </li>
            <li>
              <strong className="text-ink">Usage data:</strong> feature interactions, session
              durations, page views, and AI credit consumption.
            </li>
            <li>
              <strong className="text-ink">Billing data:</strong> subscription tier and billing
              history. Payment card details are handled exclusively by Stripe and are never stored
              on our servers.
            </li>
            <li>
              <strong className="text-ink">Communications:</strong> messages you send to our support
              team or feedback you submit.
            </li>
          </ul>
        </Section>

        <Section title="2. How We Use Your Information">
          We use your information solely to operate and improve the Service:
          <ul className="list-disc pl-5 mt-3 space-y-2 text-slate">
            <li>Provision and maintain your account and workspaces.</li>
            <li>
              Process AI requests via OpenRouter API — all calls are made server-side; your
              data is never sent directly from your browser to OpenRouter or its underlying models.
            </li>
            <li>
              Send transactional emails (workspace invitations, password resets, billing receipts)
              via Resend.
            </li>
            <li>Process subscription payments and manage billing via Stripe.</li>
            <li>Detect and prevent fraud, abuse, and violations of our Terms of Service.</li>
            <li>Analyze aggregate usage patterns to improve product features.</li>
          </ul>
          We do not use your data for advertising and we do not sell your data to any third party.
        </Section>

        <Section title="3. Data Storage & Security">
          <p>
            Your data is stored in a PostgreSQL database (hosted on Supabase or a compatible
            PostgreSQL provider) with PgBouncer connection pooling. All data is encrypted at rest
            and in transit via TLS 1.2+.
          </p>
          <p className="mt-3">
            Additional security measures include:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-2 text-slate">
            <li>bcrypt hashing for passwords (minimum cost factor 12).</li>
            <li>HTTP-only, secure, SameSite session cookies.</li>
            <li>CSRF protection on all state-changing endpoints.</li>
            <li>Rate limiting on authentication and AI endpoints.</li>
          </ul>
        </Section>

        <Section title="4. Third-Party Services">
          VisionBoard shares data with the following sub-processors solely to deliver the Service:
          <ul className="list-disc pl-5 mt-3 space-y-2 text-slate">
            <li>
              <strong className="text-ink">OpenRouter</strong> — routes AI requests to the
              underlying language models powering roadmap generation, goal deconstruction, and
              natural language board editing. Prompts are transmitted server-side only; interaction
              logs are retained for 90 days.
            </li>
            <li>
              <strong className="text-ink">Stripe</strong> — handles all payment processing and
              subscription management. We store only your Stripe customer ID and subscription
              status; card details never touch our servers.
            </li>
            <li>
              <strong className="text-ink">Resend</strong> — delivers transactional emails
              (invitations, password resets, billing confirmations).
            </li>
            <li>
              <strong className="text-ink">Google OAuth</strong> — optional sign-in via your Google
              account. We receive only your name, email, and profile picture.
            </li>
          </ul>
          No other third parties have access to your personal data.
        </Section>

        <Section title="5. Cookies & Sessions">
          We use a single secure, HTTP-only session cookie (JWT-based via NextAuth.js) to maintain
          your authenticated session. This cookie is strictly necessary for the Service to function.
          We do not use advertising cookies, tracking pixels, or any third-party analytics scripts.
        </Section>

        <Section title="6. Data Retention">
          <ul className="list-disc pl-5 mt-2 space-y-2 text-slate">
            <li>
              <strong className="text-ink">Active accounts:</strong> data is retained for as long
              as your account remains active.
            </li>
            <li>
              <strong className="text-ink">Deleted accounts:</strong> personal data is permanently
              purged within 30 days of account deletion.
            </li>
            <li>
              <strong className="text-ink">AI generation logs:</strong> retained for 90 days for
              quality assurance and abuse monitoring, then permanently deleted.
            </li>
            <li>
              <strong className="text-ink">Billing records:</strong> retained for 7 years as
              required by applicable financial regulations.
            </li>
          </ul>
        </Section>

        <Section title="7. Your Rights">
          Depending on your jurisdiction (including GDPR and CCPA), you may have the right to:
          <ul className="list-disc pl-5 mt-3 space-y-2 text-slate">
            <li>Access a copy of the personal data we hold about you.</li>
            <li>Correct inaccurate or incomplete data.</li>
            <li>Request deletion of your account and all associated data.</li>
            <li>Export your workspace data in a portable format.</li>
            <li>Object to or restrict certain processing activities.</li>
            <li>Withdraw consent where processing is based on consent.</li>
          </ul>
          <p className="mt-3">
            To exercise any of these rights, email{" "}
            <a href="mailto:privacy@vision-board.tech" className="text-blue hover:underline">
              privacy@vision-board.tech
            </a>
            . We will respond within 30 days.
          </p>
        </Section>

        <Section title="8. Children&apos;s Privacy">
          VisionBoard is intended for users aged 16 and older. We do not knowingly collect personal
          information from children under 16. If you believe a child has provided us with personal
          data, please contact{" "}
          <a href="mailto:privacy@vision-board.tech" className="text-blue hover:underline">
            privacy@vision-board.tech
          </a>{" "}
          and we will promptly delete it.
        </Section>

        <Section title="9. International Transfers">
          VisionBoard operates from Nigeria. If you are accessing the Service from outside Nigeria,
          your data may be transferred to and processed in other countries where our sub-processors
          (including Stripe, Resend, OpenRouter, and Google) operate. We ensure appropriate
          safeguards are in place for such transfers, including Standard Contractual Clauses where
          required under applicable data protection law.
        </Section>

        <Section title="10. Changes to This Policy">
          We may update this Privacy Policy from time to time. For material changes, we will notify
          you by email or via an in-app notice at least 14 days before the changes take effect. The
          &ldquo;Last updated&rdquo; date at the top of this page always reflects the most recent revision.
        </Section>

        <Section title="11. Contact">
          <p>
            For privacy-related questions, data access requests, or to report a concern, contact us at:
          </p>
          <address className="not-italic mt-3 space-y-1 text-slate">
            <p>VisionBoard Inc.</p>
            <p>
              Email:{" "}
              <a href="mailto:privacy@vision-board.tech" className="text-blue hover:underline">
                privacy@vision-board.tech
              </a>
            </p>
          </address>
        </Section>

        {/* Cross-links */}
        <div className="flex items-center gap-3 pt-2 text-sm text-slate">
          <span>Related:</span>
          <Link href="/terms" className="text-blue hover:underline font-medium">
            Terms of Service
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-border p-6 shadow-xs">
      <h2 className="font-bold text-ink text-base mb-3">{title}</h2>
      <div className="text-slate text-sm leading-relaxed space-y-2">{children}</div>
    </section>
  );
}
