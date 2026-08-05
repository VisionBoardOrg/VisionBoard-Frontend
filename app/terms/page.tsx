import React from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Terms of Service — VisionBoard",
  description: "The terms that govern your use of the VisionBoard platform.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-offwhite flex flex-col">
      <Header />

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-14 space-y-6">
        {/* Page Header */}
        <div className="space-y-2">
          <span className="text-xs font-bold tracking-wider text-blue uppercase bg-blue-faint px-3 py-1 rounded-full border border-blue-light">
            Legal
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-ink tracking-tight mt-3">
            Terms of Service
          </h1>
          <p className="text-slate text-sm">Last updated: August 5, 2026</p>
        </div>

        <p className="text-slate text-sm leading-relaxed">
          These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of VisionBoard
          (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) at{" "}
          <a href="https://visionboard.app" className="text-blue hover:underline">
            visionboard.app
          </a>{" "}
          (the &ldquo;Service&rdquo;). By creating an account or using the Service, you agree to be bound by
          these Terms. If you do not agree, do not use the Service.
        </p>

        <Section title="1. Description of Service">
          VisionBoard is an AI-native product management and team workspace platform. The Service
          includes:
          <ul className="list-disc pl-5 mt-3 space-y-2 text-slate">
            <li>Visual 2D boards for managing tasks and execution workflows.</li>
            <li>
              AI-powered features: roadmap generation, goal deconstruction, and natural language
              board editing (powered via OpenRouter).
            </li>
            <li>Goal and milestone tracking with sprint management.</li>
            <li>Connected documentation linked to projects and milestones.</li>
            <li>Team collaboration tools including comments, role-based permissions, and workspace invitations.</li>
          </ul>
        </Section>

        <Section title="2. Eligibility & Accounts">
          <p>
            You must be at least 16 years old to use the Service. By creating an account, you
            represent that all information you provide is accurate and that you have the legal
            capacity to enter into these Terms.
          </p>
          <p className="mt-3">
            You are responsible for maintaining the confidentiality of your account credentials and
            for all activity that occurs under your account. Notify us immediately at{" "}
            <a href="mailto:support@visionboard.app" className="text-blue hover:underline">
              support@visionboard.app
            </a>{" "}
            if you suspect unauthorized access.
          </p>
        </Section>

        <Section title="3. Acceptable Use">
          You agree not to use the Service to:
          <ul className="list-disc pl-5 mt-3 space-y-2 text-slate">
            <li>Violate any applicable laws or regulations.</li>
            <li>Transmit harmful, abusive, defamatory, or infringing content.</li>
            <li>Attempt to gain unauthorized access to other accounts, workspaces, or systems.</li>
            <li>
              Use AI features to generate malicious, deceptive, or harmful content, or to
              circumvent safety systems.
            </li>
            <li>Reverse-engineer, scrape, or copy the Service or its underlying infrastructure.</li>
            <li>
              Resell or sublicense access to the Service without our prior written consent.
            </li>
          </ul>
          We reserve the right to suspend or terminate accounts that violate these rules without
          prior notice.
        </Section>

        <Section title="4. Subscription Plans & Billing">
          <p>
            The Service is offered under the following tiers: <strong className="text-ink">Free</strong>,{" "}
            <strong className="text-ink">Startup</strong> ($29/month or $23/month billed annually),{" "}
            <strong className="text-ink">Growth</strong> ($79/month or $63/month billed annually),
            and <strong className="text-ink">Enterprise</strong> (custom pricing).
          </p>
          <ul className="list-disc pl-5 mt-3 space-y-2 text-slate">
            <li>Paid plans are billed in advance on a monthly or annual basis via Stripe.</li>
            <li>Annual plans are paid upfront and save 20% compared to monthly billing.</li>
            <li>
              Downgrading your plan may result in loss of access to features or data that exceeds
              the limits of your new tier. You are responsible for exporting any data before
              downgrading.
            </li>
            <li>
              We reserve the right to modify pricing with 30 days&apos; written notice. Continued
              use after the effective date constitutes acceptance of the new pricing.
            </li>
            <li>
              Refunds are handled on a case-by-case basis. To request a refund, contact{" "}
              <a href="mailto:billing@visionboard.app" className="text-blue hover:underline">
                billing@visionboard.app
              </a>
              .
            </li>
          </ul>
        </Section>

        <Section title="5. AI Credits & Features">
          <p>
            AI features consume credits allocated to your plan (Free: 10/month, Startup:
            100/month, Growth &amp; Enterprise: unlimited). Credits reset at the start of each
            billing cycle and do not roll over.
          </p>
          <p className="mt-3">
            AI-generated content (roadmaps, goal breakdowns, board edits) is provided as a
            productivity aid. VisionBoard does not guarantee the accuracy, completeness, or
            fitness for purpose of any AI output. You are responsible for reviewing AI-generated
            content before acting on it.
          </p>
        </Section>

        <Section title="6. Data Ownership & Licenses">
          <p>
            You retain full ownership of all data, content, and intellectual property you submit
            to the Service (&ldquo;User Content&rdquo;).
          </p>
          <p className="mt-3">
            By using the Service, you grant VisionBoard a limited, non-exclusive, royalty-free
            license to store, process, and display your User Content solely as necessary to
            provide the Service to you. We do not claim ownership of your content and we do not
            use it to train AI models.
          </p>
        </Section>

        <Section title="7. Service Availability">
          We aim for high availability but do not guarantee uninterrupted service. We may perform
          scheduled or emergency maintenance and will provide reasonable advance notice where
          possible. VisionBoard is not liable for downtime except as expressly agreed in an
          Enterprise SLA.
        </Section>

        <Section title="8. Termination">
          <ul className="list-disc pl-5 mt-2 space-y-2 text-slate">
            <li>
              <strong className="text-ink">By you:</strong> You may cancel your subscription or
              delete your account at any time from your workspace settings. Your data will be
              retained in read-only mode for 30 days, after which it will be permanently deleted.
            </li>
            <li>
              <strong className="text-ink">By us:</strong> We may suspend or terminate your account
              for violation of these Terms, non-payment, or if required by law. Where possible,
              we will provide advance notice and an opportunity to export your data.
            </li>
          </ul>
        </Section>

        <Section title="9. Disclaimers">
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind,
          express or implied, including but not limited to warranties of merchantability, fitness
          for a particular purpose, or non-infringement. We do not warrant that the Service will
          be error-free or that defects will be corrected.
        </Section>

        <Section title="10. Limitation of Liability">
          To the maximum extent permitted by applicable law, VisionBoard and its affiliates,
          officers, and employees shall not be liable for any indirect, incidental, special,
          consequential, or punitive damages arising from your use of, or inability to use, the
          Service — including loss of data, loss of revenue, or loss of goodwill — even if
          advised of the possibility of such damages. Our total aggregate liability shall not
          exceed the greater of (a) the amount you paid to VisionBoard in the 12 months preceding
          the claim or (b) $100 USD.
        </Section>

        <Section title="11. Governing Law">
          These Terms are governed by the laws of the Federal Republic of Nigeria, without regard
          to conflict of law principles. Any disputes shall be resolved exclusively in the courts
          of competent jurisdiction in Nigeria, and you consent to personal jurisdiction in those
          courts.
        </Section>

        <Section title="12. Changes to These Terms">
          We may update these Terms from time to time. For material changes, we will notify you
          via email or an in-app notice at least 14 days before the new Terms take effect.
          Continued use of the Service after the effective date constitutes your acceptance of
          the revised Terms. The &ldquo;Last updated&rdquo; date at the top of this page always reflects
          the most recent revision.
        </Section>

        <Section title="13. Contact">
          <p>For questions about these Terms, contact us at:</p>
          <address className="not-italic mt-3 space-y-1 text-slate">
            <p>VisionBoard Inc.</p>
            <p>
              Email:{" "}
              <a href="mailto:legal@visionboard.app" className="text-blue hover:underline">
                legal@visionboard.app
              </a>
            </p>
          </address>
        </Section>

        {/* Cross-links */}
        <div className="flex items-center gap-3 pt-2 text-sm text-slate">
          <span>Related:</span>
          <Link href="/privacy" className="text-blue hover:underline font-medium">
            Privacy Policy
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
