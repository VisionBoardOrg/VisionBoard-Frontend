import { PlanTier } from "@prisma/client";

/**
 * PlanLimitContext — carries the plan tier plus named, semantically distinct
 * counts for every resource type we gate.
 *
 * Using a separate field per resource ensures the TypeScript compiler catches
 * any call site that passes the wrong count.  The previous single
 * `aiCreditsUsed` field was re-used for member counts, document counts, and
 * workspace counts, which made wrong-count bugs invisible at compile time.
 */
export interface PlanLimitContext {
  plan: PlanTier;
  /** Number of AI credits the user has consumed this month. */
  currentAiCredits: number;
  /** Current number of accepted + pending members in the workspace. */
  currentMemberCount: number;
  /** Current number of documents in the workspace. */
  currentDocumentCount: number;
  /** Current number of workspaces owned by the user. */
  currentWorkspaceCount: number;
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
  workspaces: number | null;
  members: number | null;
  aiCreditsPerMonth: number | null;
  activityLogDays: number; // -1 = unlimited
  timelineGantt: boolean;
  sprintTracking: boolean;
  integrations: boolean;
  sso: boolean;
  /** Max documents per workspace. null = unlimited */
  documents: number | null;
  /** Max total document storage in MB per workspace. null = unlimited */
  storageMb: number | null;
}

/**
 * Plan limits table.
 *
 * `null` means unlimited for every numeric field.  The old code mixed `-1` and
 * the string `"unlimited"` for the same concept; unifying on `null` lets the
 * compiler enforce nullability at every check site.
 */
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
    workspaces: null, members: 100, aiCreditsPerMonth: null, activityLogDays: 90,
    timelineGantt: true, sprintTracking: true, integrations: true, sso: false,
    documents: null, storageMb: 1000,
  },
  enterprise: {
    workspaces: null, members: null, aiCreditsPerMonth: null, activityLogDays: -1,
    timelineGantt: true, sprintTracking: true, integrations: true, sso: true,
    documents: null, storageMb: null,
  },
} as const;

const UPGRADE_COPY: Record<string, string> = {
  free: "Upgrade to the Startup plan to unlock this feature.",
  startup: "Upgrade to the Growth plan to unlock this feature.",
  growth: "Upgrade to the Enterprise plan to unlock this feature.",
  enterprise: "",
};

export function checkPlanLimit(ctx: PlanLimitContext, feature: Feature): LimitCheck {
  const limits = PLAN_LIMITS[ctx.plan];
  const upgrade = UPGRADE_COPY[ctx.plan];

  switch (feature) {
    case "ai_credit": {
      const max = limits.aiCreditsPerMonth;
      if (max === null) return { allowed: true };
      if (ctx.currentAiCredits >= max) {
        return {
          allowed: false,
          reason: `You've used all ${max} AI credits this month on the ${ctx.plan} plan.`,
          upgradePrompt: upgrade,
        };
      }
      return { allowed: true };
    }

    case "timeline_gantt":
      return limits.timelineGantt
        ? { allowed: true }
        : { allowed: false, reason: "Timeline/Gantt view requires Startup plan or higher.", upgradePrompt: upgrade };

    case "sprint_tracking":
      return limits.sprintTracking
        ? { allowed: true }
        : { allowed: false, reason: "Sprint tracking requires Startup plan or higher.", upgradePrompt: upgrade };

    case "integrations":
      return limits.integrations
        ? { allowed: true }
        : { allowed: false, reason: "Integrations require Growth plan or higher.", upgradePrompt: upgrade };

    case "sso":
      return limits.sso
        ? { allowed: true }
        : { allowed: false, reason: "SSO/SAML requires Enterprise plan.", upgradePrompt: upgrade };

    case "invite_member": {
      const max = limits.members;
      if (max === null) return { allowed: true };
      if (ctx.currentMemberCount >= max) {
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
      if (max === null) return { allowed: true };
      if (ctx.currentDocumentCount >= max) {
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
      if (max === null) return { allowed: true };
      if (ctx.currentWorkspaceCount >= max) {
        return {
          allowed: false,
          reason: `Your ${ctx.plan} plan allows up to ${max} workspace${max === 1 ? "" : "s"}.`,
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
  if (max === null) return { allowed: true };
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

  if (max === null) {
    return { isApproaching: false, thresholdPercent: 0, percentage: 0 };
  }

  const percentage = Math.min(100, Math.round((currentUsage / max) * 100));

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
