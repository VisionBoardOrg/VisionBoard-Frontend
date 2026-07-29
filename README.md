<div align="center">
  <h1 align="center">VisionBoard 🚀</h1>
  <p align="center">
    <strong>Work smarter together with AI, from vision to execution.</strong>
  </p>
</div>

---

## 📖 Overview

**VisionBoard** is a next-generation workspace for product, engineering, and cross-functional teams. It moves beyond traditional task management by natively combining AI-powered roadmaps, contextual documentation, and real-time execution tracking into a single, cohesive platform.

Whether you are setting high-level company OKRs, defining product specs, running agile engineering sprints, or preparing Go-To-Market launches, VisionBoard connects strategic goals directly to day-to-day execution.

🎨 **Figma Design System & Mockups**: [VisionBoard Figma Project](https://www.figma.com/design/0phFoJ8e7D2Ba855P485wP/VisionBoard?node-id=197-34&t=en4Lqv4AKMepGlc7-0)

---

## ✨ What VisionBoard Entails

### 🤖 AI-Powered Workflow Engines
- **AI Roadmap Generator**: Transforms unstructured product specs, user feedback, and business goals into structured, milestone-driven product roadmaps.
- **Goal Deconstructor**: Deconstructs quarterly OKRs into actionable sub-tasks, owner assignments, and sprint milestones.
- **Progress Insights & Predictive Alerts**: Velocity tracking that monitors team performance and alerts managers weeks before deadlines slip.
- **Natural Language Board Commands**: Update board items, reassign capacity, and wire task dependencies using plain text commands.

### 👥 Role-Tailored Dashboards
- **Product Managers**: Manage feature roadmaps, track Goal Health Scores, and map user feedback to delivery items.
- **Executive Strategy**: Portfolio health visibility, Strategic Alignment Scores, Resource Allocation Matrices, and automated board meeting executive summaries.
- **Engineering & Ops**: Monitor sprint velocity, cross-team blocker dependency graphs, and CI/CD deployment health.
- **Marketing & Growth**: Synchronize Go-To-Market (GTM) launch timelines directly with engineering feature drops.

### 📋 Preset Workflow Templates
- **OKR Board**: Align team objectives and key results across departments with live tracking.
- **Product Roadmap**: Visual timelines connecting feedback and strategy to upcoming releases.
- **Quarterly Plan**: Resource allocation and team bandwidth mapping.
- **Sprint Board**: Agile tracking with automated velocity forecasting and blocker resolution.

---

## 🛠️ Tech Stack & Architecture

### Frontend (Current Repository)
- **Framework**: [Next.js](https://nextjs.org/) (App Router & Turbopack)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) with a custom design token architecture
- **Icons**: [Lucide React](https://lucide.dev/)
- **Typography**: Plus Jakarta Sans

### Target Full-Stack Architecture (Production Roadmap)
```
┌─────────────────────────────────────────────────────────┐
│                 VisionBoard Web Client                  │
│             (Next.js App Router + Tailwind)             │
└──────────────────────────┬──────────────────────────────┘
                           │ WebSockets / REST / SSE
┌──────────────────────────▼──────────────────────────────┐
│                    API Service Layer                    │
│            (Node.js / Next.js Serverless)               │
└──────┬───────────────────┬───────────────────┬──────────┘
       │                   │                   │
┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐
│ Database    │     │ AI Pipeline │     │ Integrations│
│ PostgreSQL  │     │ OpenAI /    │     │ GitHub /    │
│ + Prisma    │     │ Gemini LLM  │     │ Jira Sync   │
└─────────────┘     └─────────────┘     └─────────────┘
```

- **Persistence Layer**: PostgreSQL with Prisma ORM / Drizzle for workspaces, tasks, PRDs, and OKRs.
- **Real-Time Collaboration**: WebSockets / SSE for live multiplayer updates on boards and docs.
- **AI Infrastructure**: OpenAI / Google Gemini API integration with RAG (Retrieval-Augmented Generation) over team documentation.
- **Integrations**: GitHub, GitLab, and Jira webhook synchronization for automated PR/commit tracking.

---

## 💳 Subscription Tiers

- **Free**: 1 Workspace, up to 5 members, 10GB cloud storage, standard roadmap views.
- **Startup** ($23–$29/mo): 5 Workspaces, up to 25 members, 100GB storage, full roadmap views, priority support.
- **Growth** ($63–$79/mo): Unlimited workspaces, up to 100 members, 1TB storage, custom workflow automation, advanced analytics.
- **Enterprise** (Custom): Unlimited team members & storage, dedicated account manager, custom SSO (SAML/OAuth), and API access.

---

## 🚀 Getting Started

### Prerequisites
- Node.js >= 18.17.0
- npm (or yarn/pnpm/bun)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/VisionBoardOrg/VisionBoard-Frontend.git
   cd VisionBoard-Frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📁 Repository Structure

```
├── app/                  # Next.js App Router pages, layouts, and global CSS
│   ├── pricing/          # Pricing page route
│   ├── solutions/        # Solutions & role-based breakdown route
│   └── page.tsx          # Homepage
├── components/           # React UI components
│   ├── pricing/          # Pricing cards, comparison table, FAQ
│   ├── solutions/        # Role-based views, AI features, templates
│   └── reusables/        # Core design system tokens & buttons
├── lib/                  # Utility functions and shared logic
├── public/               # Static assets (images, icons)
└── README.md             # Project documentation
```

---

## 🎨 Design System & UI Guidelines

VisionBoard relies on a strict, component-driven design system:

- **Typography**: **Plus Jakarta Sans** exclusively.
- **Colors**: Configured via Tailwind design tokens (`text-blue`, `bg-offwhite`, `border-border`) in `globals.css`.
- **Components**: Use reusable components from `components/reusables/` (`<PrimaryButton>`, `<SecondaryButton>`, `<Logo>`) with proper `size` props (`sm`, `md`, `lg`).
- **Spacing**: Strict 8px grid system.

---

## 📜 License

Copyright © VisionBoard Inc. All rights reserved.