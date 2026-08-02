import Link from "next/link";
import Logo from "@/components/reusables/Logo";

export const metadata = { title: "Privacy Policy — VisionBoard" };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-offwhite">
      <header className="border-b border-border bg-white px-6 py-4 flex items-center gap-4">
        <Link href="/"><Logo markSize={28} textSize={16} /></Link>
        <span className="text-sm text-muted">/ Privacy Policy</span>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
        <div>
          <h1 className="text-3xl font-extrabold text-ink tracking-tight">Privacy Policy</h1>
          <p className="text-slate text-sm mt-2">Last updated: August 2, 2026</p>
        </div>

        <Section title="1. Information We Collect">
          We collect information you provide directly, including:
          <ul className="list-disc pl-5 mt-2 space-y-1 text-slate">
            <li>Account information: name, email address, profile picture.</li>
            <li>Workspace data: goals, milestones, tasks, documents, and board items you create.</li>
            <li>Usage data: feature interactions, session durations, and AI credit usage.</li>
            <li>Communications: support requests and feedback you send us.</li>
          </ul>
        </Section>

        <Section title="2. How We Use Your Information">
          We use your information to:
          <ul className="list-disc pl-5 mt-2 space-y-1 text-slate">
            <li>Provide, maintain, and improve the Service.</li>
            <li>Process AI requests using Anthropic Claude (server-side only; your API key is never exposed to the browser).</li>
            <li>Send transactional emails (workspace invitations, password resets) via Resend.</li>
            <li>Enforce our Terms of Service and prevent abuse.</li>
          </ul>
        </Section>

        <Section title="3. Data Storage">
          Your data is stored in a PostgreSQL database hosted on Supabase or a compatible PostgreSQL
          provider. We use PgBouncer for connection pooling. Data is encrypted at rest and in transit
          via TLS.
        </Section>

        <Section title="4. Third-Party Services">
          VisionBoard integrates with the following third parties:
          <ul className="list-disc pl-5 mt-2 space-y-1 text-slate">
            <li><strong>Anthropic Claude</strong> — AI roadmap and board features. Prompts and responses are stored in our AI generation log for audit purposes.</li>
            <li><strong>Resend</strong> — Transactional email delivery (invites, password resets).</li>
            <li><strong>Google OAuth</strong> — Optional sign-in via Google account.</li>
          </ul>
          We do not sell your data to any third party.
        </Section>

        <Section title="5. Cookies & Sessions">
          We use a secure, HTTP-only session cookie (JWT-based via NextAuth.js) to maintain your
          authenticated session. No third-party tracking cookies are used.
        </Section>

        <Section title="6. Data Retention">
          We retain your account data for as long as your account is active. If you delete your
          account, your data is permanently removed within 30 days. AI generation logs are retained
          for 90 days for quality and abuse monitoring.
        </Section>

        <Section title="7. Your Rights">
          Depending on your location, you may have rights to:
          <ul className="list-disc pl-5 mt-2 space-y-1 text-slate">
            <li>Access and export the personal data we hold about you.</li>
            <li>Correct inaccurate data.</li>
            <li>Request deletion of your account and associated data.</li>
            <li>Object to or restrict certain processing activities.</li>
          </ul>
          To exercise these rights, contact{" "}
          <a href="mailto:privacy@visionboard.app" className="text-blue hover:underline">
            privacy@visionboard.app
          </a>.
        </Section>

        <Section title="8. Security">
          We implement industry-standard security measures including TLS encryption, bcrypt password
          hashing, CSRF protection, and rate limiting on all authentication endpoints.
        </Section>

        <Section title="9. Children's Privacy">
          VisionBoard is not intended for users under the age of 16. We do not knowingly collect
          personal information from children.
        </Section>

        <Section title="10. Changes to This Policy">
          We may update this Privacy Policy periodically. We will notify users of material changes
          via email or an in-app notice at least 14 days before they take effect.
        </Section>

        <Section title="11. Contact">
          For privacy-related questions or requests, contact us at{" "}
          <a href="mailto:privacy@visionboard.app" className="text-blue hover:underline">
            privacy@visionboard.app
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
