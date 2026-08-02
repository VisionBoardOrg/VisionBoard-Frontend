import Link from "next/link";
import Logo from "@/components/reusables/Logo";

export const metadata = { title: "Terms of Service — VisionBoard" };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-offwhite">
      <header className="border-b border-border bg-white px-6 py-4 flex items-center gap-4">
        <Link href="/"><Logo markSize={28} textSize={16} /></Link>
        <span className="text-sm text-muted">/ Terms of Service</span>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
        <div>
          <h1 className="text-3xl font-extrabold text-ink tracking-tight">Terms of Service</h1>
          <p className="text-slate text-sm mt-2">Last updated: August 2, 2026</p>
        </div>

        <Section title="1. Acceptance of Terms">
          By accessing or using VisionBoard ("the Service"), you agree to be bound by these Terms of
          Service. If you do not agree, do not use the Service.
        </Section>

        <Section title="2. Description of Service">
          VisionBoard is an AI-native product management and team workspace platform. Features include
          visual boards, AI-powered roadmap generation, goal tracking, connected documentation, and
          team collaboration tools.
        </Section>

        <Section title="3. User Accounts">
          You are responsible for maintaining the confidentiality of your account credentials and for
          all activities that occur under your account. You must notify us immediately of any
          unauthorized use of your account.
        </Section>

        <Section title="4. Acceptable Use">
          You agree not to use the Service to:
          <ul className="list-disc pl-5 mt-2 space-y-1 text-slate">
            <li>Violate any applicable laws or regulations.</li>
            <li>Transmit harmful, offensive, or infringing content.</li>
            <li>Attempt to gain unauthorized access to other accounts or systems.</li>
            <li>Use AI features to generate malicious, deceptive, or harmful content.</li>
          </ul>
        </Section>

        <Section title="5. Subscription Plans & Billing">
          Paid plans are billed in advance on a monthly or annual basis. Refunds are handled on a
          case-by-case basis. Downgrading your plan may result in loss of features or data that
          exceeds the limits of your new plan. We reserve the right to modify pricing with 30 days'
          notice.
        </Section>

        <Section title="6. AI-Generated Content">
          The AI features in VisionBoard are provided as productivity tools. AI-generated content
          (roadmaps, task breakdowns, suggestions) should be reviewed before use. VisionBoard makes
          no guarantees about the accuracy or completeness of AI outputs.
        </Section>

        <Section title="7. Data Ownership">
          You retain ownership of all data, content, and intellectual property you submit to the
          Service. By using the Service, you grant VisionBoard a limited license to store, process,
          and display your content solely to provide the Service.
        </Section>

        <Section title="8. Service Availability">
          We aim for high availability but do not guarantee uninterrupted service. We may perform
          maintenance with reasonable notice and are not liable for downtime outside of any agreed
          SLA in Enterprise contracts.
        </Section>

        <Section title="9. Termination">
          We reserve the right to suspend or terminate accounts that violate these terms. You may
          cancel your account at any time from your workspace settings. Upon termination, your data
          may be deleted after a 30-day grace period.
        </Section>

        <Section title="10. Limitation of Liability">
          To the maximum extent permitted by law, VisionBoard shall not be liable for any indirect,
          incidental, special, or consequential damages arising from use of the Service.
        </Section>

        <Section title="11. Changes to Terms">
          We may update these Terms from time to time. Continued use of the Service after changes
          constitutes acceptance of the new Terms.
        </Section>

        <Section title="12. Contact">
          For questions about these Terms, contact us at{" "}
          <a href="mailto:legal@visionboard.app" className="text-blue hover:underline">
            legal@visionboard.app
          </a>.
        </Section>
      </main>

      <footer className="border-t border-border py-8 text-center text-xs text-muted">
        <p>© 2026 VisionBoard Inc. All rights reserved.</p>
        <div className="flex items-center justify-center gap-4 mt-2">
          <Link href="/terms" className="hover:text-ink transition-colors">Terms</Link>
          <Link href="/privacy" className="hover:text-ink transition-colors">Privacy</Link>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-border p-6">
      <h2 className="font-bold text-ink text-lg mb-3">{title}</h2>
      <div className="text-slate text-sm leading-relaxed">{children}</div>
    </section>
  );
}
