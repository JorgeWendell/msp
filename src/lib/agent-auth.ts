import { eq } from "drizzle-orm";

import { db } from "@/db";
import { asset } from "@/db/schema";

export function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export async function assetByAgentToken(token: string) {
  const [row] = await db
    .select()
    .from(asset)
    .where(eq(asset.agentToken, token))
    .limit(1);
  return row ?? null;
}
