/**
 * scripts/sync-supabase-to-resend.cjs
 *
 * Synchronizes all active users from Supabase PostgreSQL to Resend Contacts
 * with rich segmentation metadata properties and plan audience placement.
 *
 * Segments in Resend:
 *   - General (All users)
 *   - Free Tier (Users on free plan)
 *   - Paying Customers (Users on startup/growth/enterprise plans)
 *
 * Contact Properties:
 *   - plan: "free" | "startup" | "growth" | "enterprise"
 *   - role: "owner" | "member"
 *   - stage: "new" | "active" | "unverified"
 *   - verification_status: "verified" | "unverified"
 *   - ai_credits_used: number
 *
 * Usage:
 *   node scripts/sync-supabase-to-resend.cjs [--dry-run]
 *   npm run resend:sync
 */

const fs = require("fs");
const path = require("path");

const dryRun = process.argv.includes("--dry-run");

// ── 1. Load environment variables from .env ──────────────────────────────────
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, "utf8");
  envFile.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  });
}

const { RESEND_API_KEY, RESEND_AUDIENCE_ID } = process.env;
if (!RESEND_API_KEY) {
  console.error("❌ RESEND_API_KEY is not set in .env");
  process.exit(1);
}

const { Resend } = require("resend");
const resend = new Resend(RESEND_API_KEY);

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const RESEND_SEGMENTS = {
  GENERAL: "2277c559-95c7-40f4-abfe-c26f2189e50f",
  FREE_TIER: "94e018a8-076b-4038-80f3-9fe736c175fc",
  PAYING_CUSTOMERS: "8e01fb26-f820-445f-bb47-22f47a65fd4e",
};

function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.trim().length <= 255;
}

function parseName(name) {
  if (!name || typeof name !== "string") return {};
  const cleaned = name
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .trim();
  if (!cleaned) return {};
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0].slice(0, 50) };
  return {
    firstName: parts[0].slice(0, 50),
    lastName: parts.slice(1).join(" ").slice(0, 50),
  };
}

function computeUserProperties(user) {
  const plan = user.plan || "free";
  const isOwner = (user._count?.ownedWorkspaces ?? 0) > 0;
  const isVerified = Boolean(user.emailVerified);
  const createdTime = user.createdAt ? new Date(user.createdAt).getTime() : Date.now();
  const isNew = Date.now() - createdTime <= 14 * 24 * 60 * 60 * 1000;

  const stage = !isVerified ? "unverified" : isNew ? "new" : "active";

  return {
    plan,
    role: isOwner ? "owner" : "member",
    stage,
    verification_status: isVerified ? "verified" : "unverified",
    ai_credits_used: Number(user.aiCreditsUsed || 0),
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function upsertContact(payload, retries = 2) {
  try {
    const updateRes = await resend.contacts.update(payload);
    if (!updateRes.error) {
      return { success: true, id: updateRes.data?.id };
    }

    if (updateRes.error.statusCode === 429 && retries > 0) {
      await sleep(1500);
      return upsertContact(payload, retries - 1);
    }

    if (updateRes.error.statusCode === 404 || updateRes.error.message?.toLowerCase().includes("not found")) {
      const createRes = await resend.contacts.create(payload);
      if (createRes.error?.statusCode === 429 && retries > 0) {
        await sleep(1500);
        return upsertContact(payload, retries - 1);
      }
      return { success: !createRes.error, id: createRes.data?.id, error: createRes.error?.message };
    }

    return { success: false, error: updateRes.error.message };
  } catch (err) {
    if (retries > 0) {
      await sleep(1500);
      return upsertContact(payload, retries - 1);
    }
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log("=================================================");
  console.log("  Syncing & Segmenting Supabase Users in Resend   ");
  console.log("=================================================");
  if (dryRun) console.log("🔍 MODE: DRY RUN (no API mutations)\n");

  const generalAudienceId = RESEND_AUDIENCE_ID ? RESEND_AUDIENCE_ID.trim() : RESEND_SEGMENTS.GENERAL;
  console.log(`✅ Target Primary Audience: ${generalAudienceId}`);
  console.log(`✅ Plan Segments: Free Tier (${RESEND_SEGMENTS.FREE_TIER}) | Paying (${RESEND_SEGMENTS.PAYING_CUSTOMERS})\n`);

  // ── Query active users with relationships from Supabase ───────────────────
  console.log("📥 Querying active users and workspaces from Supabase...");
  const users = await prisma.user.findMany({
    where: {
      scheduledDeletion: null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      emailVerified: true,
      aiCreditsUsed: true,
      createdAt: true,
      _count: {
        select: {
          ownedWorkspaces: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`📊 Found ${users.length} active users in Supabase.\n`);

  let synced = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];

  const segmentCounts = {
    freeTier: 0,
    paying: 0,
    owners: 0,
    members: 0,
    unverified: 0,
    newUsers: 0,
    activeUsers: 0,
  };

  const BATCH_SIZE = 1;
  const DELAY_MS = 200; // 5 reqs/sec max ceiling, safe under 10/sec

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (user) => {
        const email = user.email ? user.email.trim().toLowerCase() : "";
        if (!isValidEmail(email)) {
          console.log(`⚠️  [SKIP] Invalid email format: "${user.email}" (${user.id})`);
          skipped++;
          return;
        }

        const { firstName, lastName } = parseName(user.name);
        const properties = computeUserProperties(user);

        // Track stats
        if (properties.plan === "free") segmentCounts.freeTier++;
        else segmentCounts.paying++;

        if (properties.role === "owner") segmentCounts.owners++;
        else segmentCounts.members++;

        if (properties.stage === "unverified") segmentCounts.unverified++;
        else if (properties.stage === "new") segmentCounts.newUsers++;
        else segmentCounts.activeUsers++;

        if (dryRun) {
          console.log(
            `[DRY-RUN] ${email} -> Plan: ${properties.plan}, Role: ${properties.role}, Stage: ${properties.stage}`
          );
          synced++;
          return;
        }

        try {
          const payload = {
            email,
            unsubscribed: false,
            audienceId: generalAudienceId,
            properties,
          };
          if (firstName) payload.firstName = firstName;
          if (lastName) payload.lastName = lastName;

          // 1. Upsert into General Audience
          const generalRes = await upsertContact(payload);
          if (!generalRes.success) {
            console.error(`❌ [FAIL] ${email}: ${generalRes.error}`);
            failed++;
            errors.push({ email, error: generalRes.error });
            return;
          }

          // 2. Also place into plan segment
          const planSegmentId =
            properties.plan === "free"
              ? RESEND_SEGMENTS.FREE_TIER
              : RESEND_SEGMENTS.PAYING_CUSTOMERS;

          const planPayload = { ...payload, audienceId: planSegmentId };
          await upsertContact(planPayload);

          console.log(
            `✨ [SYNCED] ${email} | Plan: ${properties.plan} | Role: ${properties.role} | Stage: ${properties.stage}`
          );
          synced++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`❌ [ERROR] ${email}: ${msg}`);
          failed++;
          errors.push({ email, error: msg });
        }
      })
    );

    if (i + BATCH_SIZE < users.length) {
      await sleep(DELAY_MS);
    }
  }

  console.log("\n=================================================");
  console.log("  Segmentation & Sync Summary                    ");
  console.log("=================================================");
  console.log(`  Total Users Checked:  ${users.length}`);
  console.log(`  Successfully Synced:  ${synced}`);
  console.log(`  Skipped (Invalid):    ${skipped}`);
  console.log(`  Failed:               ${failed}`);
  console.log("-------------------------------------------------");
  console.log("  Segment Distribution:");
  console.log(`    • Free Tier:        ${segmentCounts.freeTier}`);
  console.log(`    • Paying Customers: ${segmentCounts.paying}`);
  console.log(`    • Workspace Owners: ${segmentCounts.owners}`);
  console.log(`    • Invited Members:  ${segmentCounts.members}`);
  console.log(`    • Unverified:       ${segmentCounts.unverified}`);
  console.log(`    • New Users:        ${segmentCounts.newUsers}`);
  console.log(`    • Active Users:     ${segmentCounts.activeUsers}`);
  if (errors.length > 0) {
    console.log("\nErrors encountered:");
    errors.forEach((e) => console.log(`  - ${e.email}: ${e.error}`));
  }
  console.log("=================================================\n");
}

main()
  .catch((err) => {
    console.error("Fatal error during sync:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
