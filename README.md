<div align="center">
  <h1 align="center">VisionBoard 🚀</h1>
  <p align="center">
    <strong>Work smarter together with AI, from vision to execution.</strong>
  </p>
</div>

---

## 📖 Overview

**VisionBoard** is a next-generation workspace for product, engineering, and cross-functional teams. It moves beyond traditional task management by natively combining AI-powered roadmaps, contextual documentation, interactive Kanban & timeline boards, and real-time execution tracking into a single, cohesive platform.

Whether you are setting high-level company OKRs, defining product specs with rich docs, running agile engineering sprints, or preparing Go-To-Market launches, VisionBoard connects strategic goals directly to day-to-day execution.

🎨 **Figma Design System & Mockups**: [VisionBoard Figma Project](https://www.figma.com/design/0phFoJ8e7D2Ba855P485wP/VisionBoard?node-id=197-34&t=en4Lqv4AKMepGlc7-0)

---

## ✨ What VisionBoard Entails

### 🤖 AI-Powered Workflow Engines
- **AI Roadmap Generator**: Transforms unstructured product specs, user feedback, and business goals into structured, milestone-driven product roadmaps.
- **Goal Deconstructor**: Deconstructs quarterly OKRs into actionable sub-tasks, owner assignments, and sprint milestones.
- **Progress Insights & Predictive Alerts**: Velocity tracking that monitors team performance and alerts managers before deadlines slip.
- **Natural Language Copilot**: Contextually assistant embedded into docs and boards to generate tasks, summarize documents, reassign capacity, and manage project dependencies.

### 👥 Role-Tailored Dashboards
- **Product Managers**: Manage feature roadmaps, track Goal Health Scores, and map user feedback to delivery items.
- **Executive Strategy**: Portfolio health visibility, Strategic Alignment Scores, Resource Allocation Matrices, and automated board meeting executive summaries.
- **Engineering & Ops**: Monitor sprint velocity, cross-team blocker dependency graphs, and CI/CD deployment health.
- **Marketing & Growth**: Synchronize Go-To-Market (GTM) launch timelines directly with engineering feature drops.

### 📋 Preset Workflow Templates & Tooling
- **OKR Board**: Align team objectives and key results across departments with live tracking.
- **Product Roadmap**: Visual timelines connecting feedback and strategy to upcoming releases.
- **Agile Sprint Board**: Drag-and-drop task tracking with automated velocity forecasting and blocker resolution.
- **Rich-Text Docs & Spec Editor**: Embedded TipTap rich-text documentation with support for uploading PDF, Word, and Excel files.

---

## 🛠️ Tech Stack & Architecture

### Full-Stack Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   VisionBoard Web Client                    │
│      (Next.js 16 App Router + React 19 + Tailwind v4)       │
└──────────────────────────────┬──────────────────────────────┘
                               │ REST / Server Actions / API
┌──────────────────────────────▼──────────────────────────────┐
│                  Next.js App & API Layer                    │
│      (NextAuth.js v5, Stripe Webhooks, AI Copilot API)      │
└──────┬───────────────────┬───────────────────┬──────────────┘
       │                   │                   │
┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐
│ Database    │     │ AI Pipeline │     │ Payments &  │
│ PostgreSQL  │     │ OpenAI /    │     │ Email       │
│ + Prisma    │     │ OpenRouter  │     │ Stripe /    │
└─────────────┘     └─────────────┘     │ Resend      │
                                        └─────────────┘
```

### Core Technologies

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router & Turbopack) & [React 19](https://react.dev/)
- **Language**: [TypeScript 5.9](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) with custom design token architecture
- **State Management**: [Zustand](https://zustand-demo.pmnd.rs/) for global UI and board states
- **Database & ORM**: PostgreSQL with [Prisma ORM 5](https://www.prisma.io/)
- **Authentication**: [NextAuth.js v5](https://authjs.dev/) with `@auth/prisma-adapter` & Google OAuth
- **Interactive UI**: 
  - `@dnd-kit` for drag-and-drop Kanban boards and task reordering
  - `@tiptap` for rich-text documentation editing
  - `recharts` for team velocity and goal tracking analytics
  - `lucide-react` for modern icon set
- **AI Infrastructure**: [OpenAI](https://openai.com/) / OpenRouter LLM integrations for intelligent copilot and task decomposition
- **Billing & Subscriptions**: [Stripe](https://stripe.com/) Checkout & Webhook handling
- **Communications & Uploads**: Resend & Nodemailer for transactional emails; file parsing support for PDF, DOCX, and XLSX

---

## 💳 Subscription Tiers

- **Free**: 1 Workspace, up to 5 members, standard roadmap views.
- **Startup** ($23–$29/mo): 5 Workspaces, up to 25 members, full roadmap views, priority support.
- **Growth** ($63–$79/mo): Unlimited workspaces, up to 100 members, custom workflow automation, advanced analytics.
- **Enterprise** (Custom): Unlimited team members & storage, dedicated account manager, custom SSO (SAML/OAuth), and API access.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `>= 18.17.0`
- **Package Manager**: `npm` (or `yarn`, `pnpm`, `bun`)
- **Database**: PostgreSQL instance (Local PostgreSQL, Supabase, or Neon)

### Installation & Local Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/VisionBoardOrg/VisionBoard.git
   cd VisionBoard
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy the example environment file and fill in your keys:
   ```bash
   cp .env.example .env
   ```
   *Ensure `DATABASE_URL`, `AUTH_SECRET`, `OPENROUTER_API_KEY`, and `STRIPE_SECRET_KEY` are populated.*

4. **Initialize Database Schema:**
   Generate the Prisma Client and sync your PostgreSQL database schema:
   ```bash
   npx prisma db push
   ```

5. **Start the Development Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📁 Repository Structure

```
├── app/                  # Next.js App Router (pages, layouts, and API routes)
│   ├── account/          # User profile and account settings
│   ├── admin/            # System administration console
│   ├── api/              # Backend API route endpoints (AI, Auth, Board, Stripe, Tasks, etc.)
│   ├── auth/             # Authentication pages (login, register, layout)
│   ├── dashboard/        # Core workspace dashboard view
│   ├── features/         # Product feature showcase routes
│   ├── onboarding/       # User onboarding flow
│   ├── pricing/          # Pricing and subscription plan page
│   ├── reset-password/   # Account recovery flow
│   ├── solutions/        # Role-tailored solutions pages
│   └── workspace/        # Interactive workspace, board, and documentation views
├── components/           # React UI components
│   ├── board/            # Kanban, table, and sprint board components
│   ├── copilot/          # AI Assistant panel & chat interface
│   ├── dashboard/        # Dashboard metrics, widgets, and charts
│   ├── docs/             # TipTap rich-text document editor & reader
│   ├── goals/            # OKR health and goal tracking UI
│   ├── pricing/          # Subscription cards, comparison tables, FAQ
│   ├── reusables/        # Design system primitives (buttons, modals, inputs)
│   ├── roadmap/          # Roadmap timeline components
│   └── tasks/            # Task detail drawers, forms, and cards
├── lib/                  # Database clients (Prisma), utility helpers, and schema validations
├── prisma/               # Database models (`schema.prisma`) and migration history
├── store/                # Zustand global state management stores
├── types/                # Shared TypeScript definitions
├── hooks/                # Custom React hooks
├── public/               # Static public assets and media
├── auth.config.ts        # NextAuth authentication config
└── README.md             # Project documentation
```

---

## 🎨 Design System & UI Guidelines

VisionBoard relies on a strict, component-driven design system:

- **Typography**: **Plus Jakarta Sans** exclusively.
- **Colors**: Configured via Tailwind design tokens (`text-blue`, `bg-offwhite`, `border-border`) in `globals.css`.
- **Components**: Reusable components reside in `components/reusables/` (`<PrimaryButton>`, `<SecondaryButton>`, `<Logo>`) supporting consistent sizing props (`sm`, `md`, `lg`).
- **Spacing Grid**: Strict 8px layout grid system.

---

## 📜 License

Copyright © VisionBoard Inc. All rights reserved.