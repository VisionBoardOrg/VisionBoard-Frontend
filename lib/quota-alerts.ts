import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS } from "@/lib/plan-limits";

export type QuotaWarningLevel = "none" | "warning_80" | "critical_90" | "exceeded";

export interface QuotaStatus {
  used: number;
  max: number | "unlimited";
  percentage: number;
  remaining: number | "unlimited";
  warningLevel: QuotaWarningLevel;
  isWarning: boolean;
  message?: string;
  upgradePrompt?: string;
}

export interface WorkspaceQuotaEvaluation {
  workspaceId: string;
  workspaceName: string;
  plan: string;
  aiCredits: QuotaStatus;
  storage: QuotaStatus & { usedMb: number; maxMb: number | "unlimited" };
  hasAnyWarning: boolean;
}

const UPGRADE_PROMPTS: Record<string, string> = {
  free: "Upgrade to Startup for 100 AI credits and 100MB storage.",
  startup: "Upgrade to Growth for unlimited AI credits and 1GB storage.",
  growth: "Contact sales to upgrade to Enterprise for custom quotas.",
  enterprise: "",
};

/**
 * Evaluates both AI credits and document storage capacity against plan thresholds (80%, 90%, 100%).
 */
export async function evaluateQuotaThresholds(
  workspaceId: string
): Promise<WorkspaceQuotaEvaluation | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      storageUsedBytes: true,
      ownerId: true,
      owner: {
        select: {
          plan: true,
          aiCreditsUsed: true,
        },
      },
    },
  });

  if (!workspace) return null;

  const plan = workspace.owner.plan ?? "free";
  const limits = PLAN_LIMITS[plan];
  const upgradePrompt = UPGRADE_PROMPTS[plan] || "";

  // ── 1. AI Credits Evaluation ──────────────────────────────────────────────
  const aiMax = limits.aiCreditsPerMonth;
  let aiStatus: QuotaStatus;

  if (aiMax === -1 || aiMax === "unlimited") {
    aiStatus = {
      used: workspace.owner.aiCreditsUsed,
      max: "unlimited",
      percentage: 0,
      remaining: "unlimited",
      warningLevel: "none",
      isWarning: false,
    };
  } else {
    const maxNum = Number(aiMax);
    const used = workspace.owner.aiCreditsUsed;
    const percentage = Math.min(100, Math.round((used / maxNum) * 100));
    const remaining = Math.max(0, maxNum - used);

    let warningLevel: QuotaWarningLevel = "none";
    let message: string | undefined;

    if (percentage >= 100) {
      warningLevel = "exceeded";
      message = `All ${maxNum} monthly AI credits consumed.`;
    } else if (percentage >= 90) {
      warningLevel = "critical_90";
      message = `Critical: 90% of AI credits used (${used}/${maxNum}). ${remaining} credits remaining.`;
    } else if (percentage >= 80) {
      warningLevel = "warning_80";
      message = `Notice: 80% of AI credits used (${used}/${maxNum}).`;
    }

    aiStatus = {
      used,
      max: maxNum,
      percentage,
      remaining,
      warningLevel,
      isWarning: warningLevel !== "none",
      message,
      upgradePrompt: warningLevel !== "none" ? upgradePrompt : undefined,
    };
  }

  // ── 2. Storage Evaluation ────────────────────────────────────────────────
  const storageMaxMb = limits.storageMb;
  let storageStatus: QuotaStatus & { usedMb: number; maxMb: number | "unlimited" };

  if (storageMaxMb === -1) {
    const usedMb = Number(workspace.storageUsedBytes) / (1024 * 1024);
    storageStatus = {
      used: Number(workspace.storageUsedBytes),
      usedMb: Number(usedMb.toFixed(2)),
      max: "unlimited",
      maxMb: "unlimited",
      percentage: 0,
      remaining: "unlimited",
      warningLevel: "none",
      isWarning: false,
    };
  } else {
    const maxMbNum = Number(storageMaxMb);
    const maxBytes = BigInt(maxMbNum) * BigInt(1024 * 1024);
    const usedBytes = workspace.storageUsedBytes;
    const usedMb = Number(usedBytes) / (1024 * 1024);
    const percentage = Math.min(100, Math.round((Number(usedBytes) / Number(maxBytes)) * 100));
    const remainingMb = Math.max(0, maxMbNum - usedMb);

    let warningLevel: QuotaWarningLevel = "none";
    let message: string | undefined;

    if (percentage >= 100) {
      warningLevel = "exceeded";
      message = `Storage limit reached (${maxMbNum}MB). Document uploads are blocked.`;
    } else if (percentage >= 90) {
      warningLevel = "critical_90";
      message = `Critical: 90% of storage used (${usedMb.toFixed(1)}MB of ${maxMbNum}MB).`;
    } else if (percentage >= 80) {
      warningLevel = "warning_80";
      message = `Notice: 80% of storage used (${usedMb.toFixed(1)}MB of ${maxMbNum}MB).`;
    }

    storageStatus = {
      used: Number(usedBytes),
      usedMb: Number(usedMb.toFixed(2)),
      max: Number(maxBytes),
      maxMb: maxMbNum,
      percentage,
      remaining: Math.round(remainingMb * 1024 * 1024),
      warningLevel,
      isWarning: warningLevel !== "none",
      message,
      upgradePrompt: warningLevel !== "none" ? upgradePrompt : undefined,
    };
  }

  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    plan,
    aiCredits: aiStatus,
    storage: storageStatus,
    hasAnyWarning: aiStatus.isWarning || storageStatus.isWarning,
  };
}

/**
 * Checks if a workspace has crossed warning thresholds and records an ActivityLog if needed.
 */
export async function checkAndRecordQuotaWarning(workspaceId: string): Promise<void> {
  const evalResult = await evaluateQuotaThresholds(workspaceId);
  if (!evalResult || !evalResult.hasAnyWarning) return;

  // Check if a warning was already recorded in the last 24 hours to avoid spamming activity logs
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentLog = await prisma.activityLog.findFirst({
    where: {
      workspaceId,
      action: "quota_threshold_warning",
      createdAt: { gte: oneDayAgo },
    },
  });

  if (!recentLog) {
    const owner = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true },
    });

    await prisma.activityLog.create({
      data: {
        workspaceId,
        userId: owner?.ownerId ?? null,
        entityType: "workspace",
        entityId: workspaceId,
        action: "quota_threshold_warning",
        diff: {
          aiCredits: {
            percentage: evalResult.aiCredits.percentage,
            warningLevel: evalResult.aiCredits.warningLevel,
            used: evalResult.aiCredits.used,
            max: evalResult.aiCredits.max,
          },
          storage: {
            percentage: evalResult.storage.percentage,
            warningLevel: evalResult.storage.warningLevel,
            usedMb: evalResult.storage.usedMb,
            maxMb: evalResult.storage.maxMb,
          },
        },
      },
    }).catch((err) => console.error("[quota-alerts] ActivityLog write error:", err));
  }
}
