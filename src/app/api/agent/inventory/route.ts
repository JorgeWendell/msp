import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { isAssetKind } from "@/config/inventario";
import { db } from "@/db";
import { asset, assetInventory } from "@/db/schema";
import { assetByAgentToken, bearerToken } from "@/lib/agent-auth";
import { pickLanAdapter } from "@/lib/lan-ip";
import { encryptSecret } from "@/lib/vault-crypto";

const schema = z.object({
  agentVersion: z.string().optional(),
  collectedAt: z.string().optional(),
  system: z.record(z.string(), z.unknown()).optional(),
  cpu: z.record(z.string(), z.unknown()).optional(),
  memory: z.record(z.string(), z.unknown()).optional(),
  motherboard: z.record(z.string(), z.unknown()).optional(),
  printers: z.array(z.unknown()).optional(),
  disks: z.array(z.unknown()).optional(),
  network: z.record(z.string(), z.unknown()).optional(),
  users: z.array(z.unknown()).optional(),
  software: z.array(z.unknown()).optional(),
  processes: z.array(z.unknown()).optional(),
  services: z.array(z.unknown()).optional(),
  events: z.array(z.unknown()).optional(),
});

function machineKind(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (isAssetKind(raw)) return raw;
  if (raw.includes("note") || raw.includes("laptop")) return "notebook";
  if (raw.includes("serv")) return "servidor";
  if (raw.includes("desk")) return "desktop";
  return null;
}

function asString(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = stripNuls(String(value)).trim();
  return text || null;
}

function stripNuls(value: string) {
  return value.replace(/\u0000/g, "").replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function sanitizeJson(value: unknown): unknown {
  if (typeof value === "string") return stripNuls(value);
  if (Array.isArray(value)) return value.map(sanitizeJson);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[stripNuls(key)] = sanitizeJson(nested);
    }
    return out;
  }
  return value;
}

function firstAdapter(network: Record<string, unknown> | undefined) {
  return pickLanAdapter(network?.adapters) as Record<string, unknown> | null;
}

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
    return NextResponse.json({ error: "Inventário inválido." }, { status: 400 });
  }

  const payload = sanitizeJson({ ...parsed.data }) as Record<string, unknown>;
  const system = {
    ...((payload.system ?? {}) as Record<string, unknown>),
  };
  const windowsKey = asString(system.windowsKey);
  if (windowsKey) {
    try {
      system.windowsKey = encryptSecret(windowsKey);
    } catch {
      system.windowsKey = null;
    }
  }
  payload.system = system;

  const network = parsed.data.network as Record<string, unknown> | undefined;
  const nic = firstAdapter(network);
  const kind =
    machineKind(system.machineType) ?? machineKind(system.kind) ?? owned.kind;
  const now = new Date();
  const collectedAt = parsed.data.collectedAt
    ? new Date(parsed.data.collectedAt)
    : now;

  await db
    .update(asset)
    .set({
      hostname: asString(system.hostname) || owned.hostname,
      serial: asString(system.serial) || owned.serial,
      os: asString(system.os) || owned.os,
      ip: asString(nic?.ipv4) || asString(network?.publicIp) || owned.ip,
      mac: asString(nic?.mac) || owned.mac,
      kind,
      agentStatus: "online",
      agentVersion: parsed.data.agentVersion || owned.agentVersion,
      lastSeenAt: now,
      updatedAt: now,
    })
    .where(eq(asset.id, owned.id));

  const [current] = await db
    .select({ id: assetInventory.id })
    .from(assetInventory)
    .where(eq(assetInventory.assetId, owned.id))
    .limit(1);

  if (current) {
    await db
      .update(assetInventory)
      .set({
        payload,
        collectedAt,
        updatedAt: now,
      })
      .where(eq(assetInventory.id, current.id));
  } else {
    await db.insert(assetInventory).values({
      id: crypto.randomUUID(),
      organizationId: owned.organizationId,
      assetId: owned.id,
      payload,
      collectedAt,
      createdAt: now,
      updatedAt: now,
    });
  }

  return NextResponse.json({ ok: true });
}
