import { PlanTier } from "@prisma/client";

interface WorkspaceContext {
  plan: PlanTier;
  aiCreditsUsed: number;
}

interface LimitCheck {
  allowed: boolean;
  reason?: string;
  upgradePrompt?: string;
}

type Feature = "ai_credit" | "timeline_gantt" | "sprint_tracking" | "integrations" | "sso" | "invite_member";

interface PlanLimitDef {
  workspaces: number | "unlimited";
  members: number | "unlimited";
  aiCreditsPerMonth: number | "unlimited";
  activityLogDays: number; // -1 = unlimited
  timelineGantt: boolean;
  sprintTracking: boolean;
  integrations: boolean;
  sso: boolean;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimitDef> = {
  free: {
    workspaces: 1, members: 5, aiCreditsPerMonth: 10, activityLogDays: 7,
    timelineGantt: false, sprintTracking: false, integrations: false, sso: false,
  },
  startup: {
    workspaces: 5, members: 25, aiCreditsPerMonth: 100, activityLogDays: 30,
    timelineGantt: true, sprintTracking: true, integrations: false, sso: false,
  },
  growth: {
    workspaces: -1, members: 100, aiCreditsPerMonth: -1, activityLogDays: 90,
    timelineGantt: true, sprintTracking: true, integrations: true, sso: false,
  },
  enterprise: {
    workspaces: -1, members: -1, aiCreditsPerMonth: -1, activityLogDays: -1,
    timelineGantt: true, sprintTracking: true, integrations: true, sso: true,
  },
} as const;

const UPGRADE_COPY: Record<string, string> = {
  free: "Upgrade to the Startup plan to unlock this feature.",
  startup: "Upgrade to the Growth plan to unlock this feature.",
  growth: "Upgrade to the Enterprise plan to unlock this feature.",
  enterprise: "",
};

export function checkPlanLimit(ctx: WorkspaceContext, feature: Feature): LimitCheck {
  const limits = PLAN_LIMITS[ctx.plan];
  const upgrade = UPGRADE_COPY[ctx.plan];

  switch (feature) {
    case "ai_credit": {
      const max = limits.aiCreditsPerMonth;
      if (max === -1 || max === "unlimited") return { allowed: true };
      if (ctx.aiCreditsUsed >= (max as number)) {
        return {
          allowed: false,
          reason: `You've used all ${max} AI credits this month on the ${ctx.plan} plan.`,
          upgradePrompt: upgrade,
        };
      }
      return { allowed: true };
    }
    case "timeline_gantt":
      return limits.timelineGantt ? { allowed: true } : { allowed: false, reason: "Timeline/Gantt view requires Startup plan or higher.", upgradePrompt: upgrade };
    case "sprint_tracking":
      return limits.sprintTracking ? { allowed: true } : { allowed: false, reason: "Sprint tracking requires Startup plan or higher.", upgradePrompt: upgrade };
    case "integrations":
      return limits.integrations ? { allowed: true } : { allowed: false, reason: "Integrations require Growth plan or higher.", upgradePrompt: upgrade };
    case "sso":
      return limits.sso ? { allowed: true } : { allowed: false, reason: "SSO/SAML requires Enterprise plan.", upgradePrompt: upgrade };
    case "invite_member": {
      // ctx.aiCreditsUsed is overloaded to carry member count here
      const max = limits.members;
      if (max === -1 || max === "unlimited") return { allowed: true };
      if (ctx.aiCreditsUsed >= (max as number)) {
        return {
          allowed: false,
          reason: `Your ${ctx.plan} plan allows up to ${max} team members.`,
          upgradePrompt: upgrade,
        };
      }
      return { allowed: true };
    }
    default:
      return { allowed: true };
  }
}
