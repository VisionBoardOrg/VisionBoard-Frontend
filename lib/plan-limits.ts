import { PlanTier } from "@prisma/client";

/**
 * WorkspaceContext carries the plan and a generic "current count" field.
 *
 * `aiCreditsUsed` is kept for backwards-compatibility but is conceptually
 * overloaded — each call site passes the relevant count (credits, members,
 * documents, workspaces) as this field.
 */
interface WorkspaceContext {
  plan: PlanTier;
  aiCreditsUsed: number;
}

interface LimitCheck {
  allowed: boolean;
  reason?: string;
  upgradePrompt?: string;
}

type Feature =
  | "ai_credit"
  | "timeline_gantt"
  | "sprint_tracking"
  | "integrations"
  | "sso"
  | "invite_member"
  | "create_document"
  | "create_workspace";

interface PlanLimitDef {
  workspaces: number | "unlimited";
  members: number | "unlimited";
  aiCreditsPerMonth: number | "unlimited";
  activityLogDays: number; // -1 = unlimited
  timelineGantt: boolean;
  sprintTracking: boolean;
  integrations: boolean;
  sso: boolean;
  /** Max documents per workspace. -1 = unlimited */
  documents: number;
  /** Max total document storage in MB per workspace. -1 = unlimited */
  storageMb: number;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimitDef> = {
  free: {
    workspaces: 1, members: 5, aiCreditsPerMonth: 10, activityLogDays: 7,
    timelineGantt: false, sprintTracking: false, integrations: false, sso: false,
    documents: 10, storageMb: 5,
  },
  startup: {
    workspaces: 5, members: 25, aiCreditsPerMonth: 100, activityLogDays: 30,
    timelineGantt: true, sprintTracking: true, integrations: false, sso: false,
    documents: 100, storageMb: 100,
  },
  growth: {
    workspaces: -1, members: 100, aiCreditsPerMonth: -1, activityLogDays: 90,
    timelineGantt: true, sprintTracking: true, integrations: true, sso: false,
    documents: -1, storageMb: 1000,
  },
  enterprise: {
    workspaces: -1, members: -1, aiCreditsPerMonth: -1, activityLogDays: -1,
    timelineGantt: true, sprintTracking: true, integrations: true, sso: true,
    documents: -1, storageMb: -1,
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
    case "create_document": {
      const max = limits.documents;
      if (max === -1) return { allowed: true };
      if (ctx.aiCreditsUsed >= max) {
        return {
          allowed: false,
          reason: `Your ${ctx.plan} plan allows up to ${max} documents per workspace.`,
          upgradePrompt: upgrade,
        };
      }
      return { allowed: true };
    }
    case "create_workspace": {
      const max = limits.workspaces;
      if (max === -1 || max === "unlimited") return { allowed: true };
      if (ctx.aiCreditsUsed >= (max as number)) {
        return {
          allowed: false,
          reason: `Your ${ctx.plan} plan allows up to ${max} workspace${(max as number) === 1 ? "" : "s"}.`,
          upgradePrompt: upgrade,
        };
      }
      return { allowed: true };
    }
    default:
      return { allowed: true };
  }
}

/**
 * Estimate storage used by an array of document content blobs (Tiptap JSON).
 * Returns megabytes.
 *
 * NOTE: This is an approximation based on JSON serialisation length.
 * It is intentionally kept as a fast in-memory estimate. For accurate tracking
 * at scale, store a pre-computed `storageUsedBytes` column on Workspace and
 * increment/decrement it atomically on document create/delete.
 */
export function estimateDocStorageMb(contents: unknown[]): number {
  const bytes = contents.reduce<number>((sum, c) => {
    try {
      return sum + Buffer.byteLength(JSON.stringify(c ?? ""), "utf8");
    } catch {
      return sum;
    }
  }, 0);
  return bytes / (1024 * 1024);
}

export function checkStorageLimit(
  plan: PlanTier,
  currentUsedMb: number,
  incomingMb: number,
): LimitCheck {
  const max = PLAN_LIMITS[plan].storageMb;
  if (max === -1) return { allowed: true };
  const upgrade = UPGRADE_COPY[plan];
  if (currentUsedMb + incomingMb > max) {
    return {
      allowed: false,
      reason: `This would exceed your ${max} MB document storage limit on the ${plan} plan.`,
      upgradePrompt: upgrade,
    };
  }
  return { allowed: true };
}

export interface QuotaThresholdWarning {
  isApproaching: boolean;
  thresholdPercent: number;
  percentage: number;
  message?: string;
  upgradePrompt?: string;
}

/**
 * Returns proactive warning details if usage has reached 80% or 90% of allowance.
 */
export function getQuotaThresholdWarning(
  plan: PlanTier,
  feature: "ai_credit" | "storage",
  currentUsage: number
): QuotaThresholdWarning {
  const limits = PLAN_LIMITS[plan];
  const max = feature === "ai_credit" ? limits.aiCreditsPerMonth : limits.storageMb;
  const upgrade = UPGRADE_COPY[plan];

  if (max === -1 || max === "unlimited") {
    return { isApproaching: false, thresholdPercent: 0, percentage: 0 };
  }

  const maxNum = Number(max);
  const percentage = Math.min(100, Math.round((currentUsage / maxNum) * 100));

  if (percentage >= 90) {
    return {
      isApproaching: true,
      thresholdPercent: 90,
      percentage,
      message: `Critical: ${percentage}% of ${feature === "ai_credit" ? "AI credits" : "storage"} used.`,
      upgradePrompt: upgrade,
    };
  }

  if (percentage >= 80) {
    return {
      isApproaching: true,
      thresholdPercent: 80,
      percentage,
      message: `Warning: ${percentage}% of ${feature === "ai_credit" ? "AI credits" : "storage"} used.`,
      upgradePrompt: upgrade,
    };
  }

  return { isApproaching: false, thresholdPercent: 0, percentage };
}

