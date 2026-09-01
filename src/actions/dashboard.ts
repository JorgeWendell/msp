"use server";

import { and, count, eq, inArray, isNull } from "drizzle-orm";

import { openTicketStatuses } from "@/config/tickets";
import { db } from "@/db";
import { asset, ticket } from "@/db/schema";
import { canAccessModule, inventoryScopeClientId, loadAccess } from "@/lib/access";
import { expireStaleAgentStatus } from "@/lib/agent-presence";
import { ActionError, tenantAction } from "@/lib/safe-action";

export const getDashboardStats = tenantAction.action(async ({ ctx }) => {
  const access = await loadAccess(ctx.organizationId, ctx.session.user.id);
  if (!access) {
    throw new ActionError("Usuário sem vínculo com a empresa.");
  }

  const canTickets = canAccessModule(access, "tickets");
  const canInventario = canAccessModule(access, "inventario");
  if (canInventario) {
    await expireStaleAgentStatus(ctx.organizationId);
  }
  const scopedClientId = inventoryScopeClientId(access);
  const org = eq(ticket.organizationId, ctx.organizationId);
  const openQueue = inArray(ticket.status, [...openTicketStatuses]);
  const withoutAgentFilters = [
    eq(asset.organizationId, ctx.organizationId),
    eq(asset.agentStatus, "desconhecido"),
    ...(scopedClientId ? [eq(asset.clientId, scopedClientId)] : []),
  ];

  const [openRow, criticalRow, unassignedRow, withoutAgentRow] =
    await Promise.all([
      canTickets
        ? db
            .select({ n: count() })
            .from(ticket)
            .where(and(org, eq(ticket.status, "aberto")))
        : Promise.resolve([{ n: 0 }]),
      canTickets
        ? db
            .select({ n: count() })
            .from(ticket)
            .where(and(org, eq(ticket.priority, "critica"), openQueue))
        : Promise.resolve([{ n: 0 }]),
      canTickets
        ? db
            .select({ n: count() })
            .from(ticket)
            .where(and(org, isNull(ticket.operatorId), openQueue))
        : Promise.resolve([{ n: 0 }]),
      canInventario
        ? db
            .select({ n: count() })
            .from(asset)
            .where(and(...withoutAgentFilters))
        : Promise.resolve([{ n: 0 }]),
    ]);

  return {
    open: canTickets ? Number(openRow[0]?.n ?? 0) : null,
    critical: canTickets ? Number(criticalRow[0]?.n ?? 0) : null,
    unassigned: canTickets ? Number(unassignedRow[0]?.n ?? 0) : null,
    withoutAgent: canInventario ? Number(withoutAgentRow[0]?.n ?? 0) : null,
    canTickets,
    canInventario,
  };
});
