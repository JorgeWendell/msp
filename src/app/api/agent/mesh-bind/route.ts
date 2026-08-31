import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { asset } from "@/db/schema";
import { assetByAgentToken, bearerToken } from "@/lib/agent-auth";
import { findMeshNodeId } from "@/lib/meshcentral";

const schema = z.object({
  nodeId: z.string().trim().optional(),
  hostname: z.string().trim().optional(),
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

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  let nodeId = parsed.data.nodeId || null;
  if (!nodeId) {
    nodeId = await findMeshNodeId(
      parsed.data.hostname || owned.hostname,
      owned.id
    );
  }
  if (!nodeId) {
    return NextResponse.json({ ok: false, bound: false });
  }

  await db
    .update(asset)
    .set({
      meshNodeId: nodeId,
      updatedAt: new Date(),
    })
    .where(eq(asset.id, owned.id));

  return NextResponse.json({ ok: true, bound: true, nodeId });
}
