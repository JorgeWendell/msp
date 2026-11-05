"use server";

import { and, eq } from "drizzle-orm";

import { monitorsInZabbix } from "@/config/inventario";
import type { MonitorHost } from "@/config/monitoramento";
import { db } from "@/db";
import { asset, client } from "@/db/schema";
import { inventoryScopeClientId } from "@/lib/access";
import { ActionError, moduleAction } from "@/lib/safe-action";
import {
  fetchZabbixNocHosts,
  getZabbixSettings,
  zabbixHostToMonitor,
} from "@/lib/zabbix";

const monitoramentoAction = moduleAction("monitoramento");

export const listMonitorHosts = monitoramentoAction.action(async ({ ctx }) => {
  const settings = getZabbixSettings();
  if (!settings.enabled) {
    return {
      configured: false,
      error: "Zabbix ainda não está configurado (ZABBIX_URL).",
      hosts: [] as MonitorHost[],
      fetchedAt: new Date().toISOString(),
    };
  }
  if (!settings.hasCredentials) {
    return {
      configured: false,
      error: "Falta ZABBIX_TOKEN ou ZABBIX_USER/ZABBIX_PASSWORD no .env.",
      hosts: [] as MonitorHost[],
      fetchedAt: new Date().toISOString(),
    };
  }

  let snapshot;
  try {
    snapshot = await fetchZabbixNocHosts();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao consultar o Zabbix.";
    throw new ActionError(message);
  }

  const scope = inventoryScopeClientId(ctx.access);
  const filters = [eq(asset.organizationId, ctx.organizationId), eq(asset.active, true)];
  if (scope) filters.push(eq(asset.clientId, scope));

  const assets = await db
    .select({
      id: asset.id,
      hostname: asset.hostname,
      ip: asset.ip,
      kind: asset.kind,
      zabbixHostId: asset.zabbixHostId,
      clientId: asset.clientId,
      clientName: client.name,
    })
    .from(asset)
    .innerJoin(client, eq(asset.clientId, client.id))
    .where(and(...filters));

  const monitored = assets.filter(
    (row) => row.zabbixHostId || monitorsInZabbix(row.kind)
  );
  const used = new Set<string>();
  const hosts: MonitorHost[] = [];

  for (const row of monitored) {
    const zhost =
      snapshot.find((item) => item.hostid === row.zabbixHostId) ??
      snapshot.find(
        (item) =>
          item.host.toLowerCase() === row.hostname.toLowerCase() ||
          item.name.toLowerCase() === row.hostname.toLowerCase() ||
          item.tags["adelmsp.asset_id"] === row.id
      );

    if (zhost) {
      used.add(zhost.hostid);
      if (zhost.hostid !== row.zabbixHostId) {
        try {
          await db
            .update(asset)
            .set({ zabbixHostId: zhost.hostid, updatedAt: new Date() })
            .where(eq(asset.id, row.id));
        } catch (error) {
          console.error(error);
        }
      }
      hosts.push(zabbixHostToMonitor(zhost, row.clientName, row.id));
      continue;
    }

    hosts.push({
      id: row.id,
      name: row.hostname,
      ip: row.ip ?? "",
      client: row.clientName,
      group: row.kind === "rede" ? "Rede" : "Servidores",
      status: "offline",
      metrics: null,
      problems: [],
      updatedAt: new Date().toISOString(),
    });
  }

  if (!scope) {
    for (const zhost of snapshot) {
      if (used.has(zhost.hostid)) continue;
      const orgTag = zhost.tags["adelmsp.org_id"];
      if (orgTag && orgTag !== ctx.organizationId) continue;
      const clientName =
        zhost.tags["adelmsp.client"] ||
        zhost.groups.find((name) => name.startsWith("AdelMSP/"))?.replace("AdelMSP/", "") ||
        zhost.groups[0] ||
        "Zabbix";
      hosts.push(zabbixHostToMonitor(zhost, clientName));
    }
  }

  return {
    configured: true,
    error: null as string | null,
    hosts,
    fetchedAt: new Date().toISOString(),
  };
});
