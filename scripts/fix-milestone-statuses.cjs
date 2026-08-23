// One-time fix: recompute every milestone's status from its tasks.
// Repairs milestones stuck at in_progress with zero started tasks (set
// manually, left stale by deleted tasks, or created by seed data) and
// reopens completed milestones that gained new todo tasks.
// Usage: node scripts/fix-milestone-statuses.cjs [--dry-run]
const fs = require("fs");
const path = require("path");

const dryRun = process.argv.includes("--dry-run");

const envFile = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const match = envFile.match(/^DATABASE_URL=(.+)$/m);
if (!match) {
  console.error("DATABASE_URL not found in .env");
  process.exit(1);
}
process.env.DATABASE_URL = match[1].trim().replace(/^"|"$/g, "");

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const STARTED = new Set(["done", "in_progress", "in_review"]);

async function main() {
  const milestones = await prisma.milestone.findMany({
    where: { status: { in: ["planned", "in_progress", "completed"] } },
    select: { id: true, title: true, status: true, tasks: { select: { status: true } } },
  });

  let changed = 0;
  for (const m of milestones) {
    if (m.tasks.length === 0) continue; // no tasks: keep stored status
    const allDone = m.tasks.every((t) => t.status === "done");
    const anyStarted = m.tasks.some((t) => STARTED.has(t.status));
    const target = allDone ? "completed" : anyStarted ? "in_progress" : "planned";
    if (target === m.status) continue;

    console.log(`"${m.title}": ${m.status} -> ${target}`);
    if (!dryRun) {
      await prisma.milestone.update({ where: { id: m.id }, data: { status: target } });
    }
    changed++;
  }

  console.log(`\n${dryRun ? "[dry-run] " : ""}${changed} of ${milestones.length} milestones ${changed === 1 ? "was" : "were"} corrected`);
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
