import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  body: z.string().min(1).max(2000),
  entityType: z.enum(["goal", "milestone", "task", "document"]),
  goalId: z.string().optional(),
  milestoneId: z.string().optional(),
  taskId: z.string().optional(),
  documentId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const comment = await prisma.comment.create({
    data: {
      body: parsed.data.body,
      authorId: session.user.id,
      entityType: parsed.data.entityType,
      goalId: parsed.data.goalId ?? null,
      milestoneId: parsed.data.milestoneId ?? null,
      taskId: parsed.data.taskId ?? null,
      documentId: parsed.data.documentId ?? null,
    },
    include: { author: { select: { id: true, name: true, image: true } } },
  });

  return NextResponse.json({ comment }, { status: 201 });
}
