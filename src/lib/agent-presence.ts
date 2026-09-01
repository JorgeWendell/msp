import { and, eq, isNull, lt, or } from "drizzle-orm";

import { isAgentStatus, type AgentStatus } from "@/config/inventario";
import { db } from "@/db";
import { asset } from "@/db/schema";

/** Heartbeat do agente a cada 60s; 3 minutos cobrem alguns pings perdidos. */
export const AGENT_ONLINE_GRACE_MS = 3 * 60 * 1000;

export function resolveAgentStatus(
  stored: string,
  lastSeenAt: Date | string | null | undefined,
  now = Date.now()
): AgentStatus {
  if (stored === "desconhecido" || !isAgentStatus(stored)) {
    return "desconhecido";
  }
  if (stored === "offline") {
    return "offline";
  }
  if (!lastSeenAt) {
    return "offline";
  }
  const seen = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
  if (Number.isNaN(seen.getTime())) {
    return "offline";
  }
  return now - seen.getTime() <= AGENT_ONLINE_GRACE_MS ? "online" : "offline";
}

export async function expireStaleAgentStatus(organizationId?: string) {
  const cutoff = new Date(Date.now() - AGENT_ONLINE_GRACE_MS);
  const now = new Date();
  const filters = [
    eq(asset.agentStatus, "online"),
    or(isNull(asset.lastSeenAt), lt(asset.lastSeenAt, cutoff)),
  ];
  if (organizationId) {
    filters.unshift(eq(asset.organizationId, organizationId));
  }
  await db
    .update(asset)
    .set({ agentStatus: "offline", updatedAt: now })
    .where(and(...filters));
}
