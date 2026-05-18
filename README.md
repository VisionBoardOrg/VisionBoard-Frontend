<div align="center">
  <h1 align="center">VisionBoard 🚀</h1>
  <p align="center">
    <strong>Work smarter together with AI, from vision to execution.</strong>
  </p>
</div>

## 📖 Overview

**VisionBoard** is a next-generation workspace for product and engineering teams. It moves beyond traditional task management by natively combining AI-powered roadmaps, contextual documentation, and real-time execution tracking into a single, cohesive platform. 

This repository contains the frontend monorepo for the VisionBoard web application.

🎨 **Figma Design System & Mockups**: [VisionBoard Figma Project](https://www.figma.com/design/0phFoJ8e7D2Ba855P485wP/VisionBoard?node-id=197-34&t=en4Lqv4AKMepGlc7-0)


## ✨ Key Features

- **AI-Powered Planning**: Generate strategic roadmaps, break down milestones, and use predictive timelines for smarter task clustering.
- **Connected Documentation**: Keep PRDs, technical specs, and meeting notes tightly linked to the goals and execution tasks they relate to.
- **Execution Visibility**: Real-time cross-team visibility across boards, sprint execution, and blocker tracking.
- **Premium Design System**: Built with a custom aesthetic utilizing a precise design token architecture for a consistently premium user experience.

## 🛠️ Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router & Turbopack)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)

## 🚀 Getting Started

### Prerequisites
- Node.js >= 18.17.0
- npm (or yarn/pnpm)

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

3. **Set up environment variables:**
   Duplicate the `.env.example` file and rename it to `.env.local`, then add your local configuration values:
   ```bash
   cp .env.example .env.local
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```
   The application will be available at [http://localhost:3000](http://localhost:3000).

## 🏗️ Architecture & Structure

```
├── app/                  # Next.js App Router pages, layouts, and global CSS
├── components/           # React components
│   ├── reusables/        # Core design system components (Buttons, Inputs, Logo, etc.)
│   └── ...               # Domain-specific components (e.g., HomeHero, FeatureSections)
├── lib/                  # Utility functions, API clients, and shared logic
├── hooks/                # Custom React hooks
├── types/                # TypeScript type definitions and interfaces
└── public/               # Static assets (images, fonts, SVGs)
```

## 🎨 Design System & UI Guidelines

VisionBoard relies on a strict, component-driven design system to maintain its premium look and feel. 

- **Typography**: We use **Plus Jakarta Sans** exclusively across the application.
- **Colors**: Rely on defined Tailwind tokens (`text-blue`, `bg-offwhite`, `border-border`) configured in the root `globals.css` rather than hardcoded hex values.
- **Components**: Always prioritize the reusable components from `components/reusables/` (e.g., `<PrimaryButton>`, `<SecondaryButton>`, `<Logo>`) instead of building ad-hoc elements. Ensure you pass the appropriate `size` prop (`sm`, `md`, `lg`) as required by the design specs.
- **Spacing**: We follow a strict 8px grid system for layout padding, margins, and gaps.

## 🤝 Contributing

We welcome contributions! As the team grows, please adhere to the following workflow:

1. **Branch Naming**: 
   - `feature/your-feature-name`
   - `bugfix/issue-description`
   - `chore/maintenance-work`
2. **Commit Messages**: We follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). (e.g., `feat: add AI roadmap generation modal`)
3. **Pull Requests**:
   - Ensure your code passes all linting (`npm run lint`) and type checks.
   - If you modify the UI, include screenshots or screen recordings of your changes.
   - Request review from at least one core frontend maintainer before merging.

## 📜 License

Copyright © VisionBoard Inc. All rights reserved.