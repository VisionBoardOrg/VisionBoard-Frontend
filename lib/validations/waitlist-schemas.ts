import { z } from "zod";

export const waitlistJoinSchema = z.object({
  email: z.string().email("Please enter a valid work email address"),
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  company: z.string().optional(),
  teamSize: z.enum(["1-10", "10-50", "50-200", "200+"]).optional(),
  role: z.enum(["product_manager", "engineering_lead", "executive", "designer", "other"]),
  painPoint: z.enum(["ai_roadmaps", "visual_canvas", "github_jira_sync", "okr_deconstruction", "other"]).optional(),
  referredBy: z.string().optional(),
  vipCode: z.string().optional(),
});

export const vipCodeSchema = z.object({
  code: z.string().min(1, "VIP access code is required"),
});

export type WaitlistJoinInput = z.infer<typeof waitlistJoinSchema>;
export type VipCodeInput = z.infer<typeof vipCodeSchema>;
