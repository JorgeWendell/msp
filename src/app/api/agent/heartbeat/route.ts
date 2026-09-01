import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { asset } from "@/db/schema";
import { assetByAgentToken, bearerToken } from "@/lib/agent-auth";

const schema = z.object({
  agentVersion: z.string().trim().optional(),
  status: z.enum(["online", "offline"]).optional(),
});

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Token ausente." }, { status: 401 });
  }

  const owned = await assetByAgentToken(token);
  if (!owned) {
    return NextResponse.json({ error: "Token inválido." }, { status: 401 });
  }

  const json = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(json);
  const now = new Date();

  await db
    .update(asset)
    .set({
      agentStatus: parsed.data?.status === "offline" ? "offline" : "online",
      agentVersion: parsed.data?.agentVersion || owned.agentVersion,
      lastSeenAt: now,
      updatedAt: now,
    })
    .where(eq(asset.id, owned.id));

  return NextResponse.json({ ok: true });
}
