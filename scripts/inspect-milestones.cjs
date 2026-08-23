// Diagnostic: for every milestone with status=in_progress, show its task status mix
const fs = require("fs");
const path = require("path");

const envFile = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const match = envFile.match(/^DATABASE_URL=(.+)$/m);
if (!match) {
  console.error("DATABASE_URL not found in .env");
  process.exit(1);
}
process.env.DATABASE_URL = match[1].trim().replace(/^"|"$/g, "");

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const milestones = await prisma.milestone.findMany({
    where: { status: "in_progress" },
    select: {
      title: true,
      status: true,
      startDate: true,
      targetDate: true,
      updatedAt: true,
      tasks: { select: { status: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 25,
  });

  let allTodo = 0;
  let started = 0;
  for (const m of milestones) {
    const counts = {};
    for (const t of m.tasks) counts[t.status] = (counts[t.status] ?? 0) + 1;
    const hasStartedTask = m.tasks.some(
      (t) => t.status === "done" || t.status === "in_progress" || t.status === "in_review"
    );
    if (hasStartedTask) started++;
    else allTodo++;
    console.log(
      `"${m.title}" start=${m.startDate?.toISOString().slice(0, 10)} target=${m.targetDate?.toISOString().slice(0, 10)} tasks=${JSON.stringify(counts)}`
    );
  }
  console.log(`\nOf ${milestones.length} in_progress milestones: ${allTodo} have ZERO started tasks, ${started} have >=1 started/done task`);
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
