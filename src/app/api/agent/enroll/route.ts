import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createAgentToken, isAssetKind } from "@/config/inventario";
import { db } from "@/db";
import { asset, client } from "@/db/schema";
import { normalizeClientCode } from "@/lib/client-code";

const enrollSchema = z.object({
  clientCode: z.string().min(1, "Informe o código do cliente."),
  hostname: z.string().trim().min(1, "Informe o hostname."),
  serial: z.string().trim().optional(),
  os: z.string().trim().optional(),
  ip: z.string().trim().optional(),
  mac: z.string().trim().optional(),
  kind: z.string().optional(),
  agentVersion: z.string().trim().optional(),
});

function machineKind(value: string | undefined) {
  const raw = (value ?? "").trim().toLowerCase();
  if (isAssetKind(raw)) return raw;
  if (raw.includes("note") || raw.includes("laptop")) return "notebook";
  if (raw.includes("serv")) return "servidor";
  if (raw.includes("desk")) return "desktop";
  return "desktop";
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = enrollSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  const code = normalizeClientCode(parsed.data.clientCode);
  if (!code) {
    return NextResponse.json(
      { error: "Código do cliente inválido. Use o formato XXX-XXX." },
      { status: 400 }
    );
  }

  const [ownedClient] = await db
    .select({
      id: client.id,
      name: client.name,
      organizationId: client.organizationId,
      active: client.active,
    })
    .from(client)
    .where(eq(client.code, code))
    .limit(1);

  if (!ownedClient || !ownedClient.active) {
    return NextResponse.json({ error: "Código inválido." }, { status: 401 });
  }

  const serial = parsed.data.serial || null;
  const hostname = parsed.data.hostname;
  const kind = machineKind(parsed.data.kind);
  const now = new Date();

  const existingFilters = serial
    ? and(
        eq(asset.clientId, ownedClient.id),
        eq(asset.serial, serial),
        eq(asset.organizationId, ownedClient.organizationId)
      )
    : and(
        eq(asset.clientId, ownedClient.id),
        eq(asset.hostname, hostname),
        eq(asset.organizationId, ownedClient.organizationId)
      );

  const [existing] = await db
    .select({
      id: asset.id,
      agentToken: asset.agentToken,
      hostname: asset.hostname,
    })
    .from(asset)
    .where(existingFilters)
    .limit(1);

  if (existing) {
    await db
      .update(asset)
      .set({
        hostname,
        serial,
        os: parsed.data.os || null,
        ip: parsed.data.ip || null,
        mac: parsed.data.mac || null,
        kind,
        agentStatus: "online",
        agentVersion: parsed.data.agentVersion || null,
        lastSeenAt: now,
        updatedAt: now,
      })
      .where(eq(asset.id, existing.id));

    return NextResponse.json({
      assetId: existing.id,
      agentToken: existing.agentToken,
      hostname,
      clientName: ownedClient.name,
      clientCode: code,
    });
  }

  const id = crypto.randomUUID();
  const agentToken = createAgentToken();
  await db.insert(asset).values({
    id,
    organizationId: ownedClient.organizationId,
    clientId: ownedClient.id,
    hostname,
    serial,
    kind,
    os: parsed.data.os || null,
    ip: parsed.data.ip || null,
    mac: parsed.data.mac || null,
    agentToken,
    agentStatus: "online",
    agentVersion: parsed.data.agentVersion || null,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({
    assetId: id,
    agentToken,
    hostname,
    clientName: ownedClient.name,
    clientCode: code,
  });
}
