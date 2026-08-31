"use server";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  createAgentToken,
  isAssetKind,
} from "@/config/inventario";
import { db } from "@/db";
import { asset, assetInventory, client } from "@/db/schema";
import { ActionError, moduleAction } from "@/lib/safe-action";
import { decryptSecret } from "@/lib/vault-crypto";

const inventarioAction = moduleAction("inventario");

async function ownedAsset(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(asset)
    .where(and(eq(asset.id, id), eq(asset.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new ActionError("Máquina não encontrada.");
  return row;
}

async function ownedClient(organizationId: string, clientId: string) {
  const [row] = await db
    .select({ id: client.id, name: client.name })
    .from(client)
    .where(and(eq(client.id, clientId), eq(client.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new ActionError("Cliente inválido.");
  return row;
}

export const listInventoryClients = inventarioAction.action(async ({ ctx }) => {
  return db
      .select({ id: client.id, name: client.name, active: client.active, code: client.code })
    .from(client)
    .where(eq(client.organizationId, ctx.organizationId))
    .orderBy(client.name);
});

export const listAssets = inventarioAction
  .inputSchema(
    z.object({
      clientId: z.string().optional(),
      kind: z.string().optional(),
      agentStatus: z.string().optional(),
    })
  )
  .action(async ({ parsedInput, ctx }) => {
    const filters = [eq(asset.organizationId, ctx.organizationId)];
    if (parsedInput.clientId) {
      filters.push(eq(asset.clientId, parsedInput.clientId));
    }
    if (parsedInput.kind && isAssetKind(parsedInput.kind)) {
      filters.push(eq(asset.kind, parsedInput.kind));
    }
    if (parsedInput.agentStatus) {
      filters.push(eq(asset.agentStatus, parsedInput.agentStatus));
    }

    return db
      .select({
        id: asset.id,
        hostname: asset.hostname,
        serial: asset.serial,
        kind: asset.kind,
        os: asset.os,
        ip: asset.ip,
        mac: asset.mac,
        location: asset.location,
        active: asset.active,
        agentStatus: asset.agentStatus,
        lastSeenAt: asset.lastSeenAt,
        meshNodeId: asset.meshNodeId,
        clientName: client.name,
      })
      .from(asset)
      .innerJoin(client, eq(asset.clientId, client.id))
      .where(and(...filters))
      .orderBy(desc(asset.createdAt));
  });

export const getAsset = inventarioAction
  .inputSchema(z.object({ id: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    const [row] = await db
      .select({
        id: asset.id,
        hostname: asset.hostname,
        serial: asset.serial,
        kind: asset.kind,
        os: asset.os,
        ip: asset.ip,
        mac: asset.mac,
        location: asset.location,
        notes: asset.notes,
        active: asset.active,
        clientId: asset.clientId,
        clientName: client.name,
        agentStatus: asset.agentStatus,
        agentToken: asset.agentToken,
        agentVersion: asset.agentVersion,
        meshNodeId: asset.meshNodeId,
        lastSeenAt: asset.lastSeenAt,
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt,
      })
      .from(asset)
      .innerJoin(client, eq(asset.clientId, client.id))
      .where(
        and(eq(asset.id, parsedInput.id), eq(asset.organizationId, ctx.organizationId))
      )
      .limit(1);

    if (!row) throw new ActionError("Máquina não encontrada.");
    return row;
  });

const saveSchema = z.object({
  id: z.string().optional(),
  clientId: z.string().min(1, "Selecione o cliente."),
  hostname: z.string().trim().min(1, "Informe o hostname."),
  serial: z.string().trim().optional(),
  kind: z.string(),
  os: z.string().trim().optional(),
  ip: z.string().trim().optional(),
  mac: z.string().trim().optional(),
  location: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  active: z.boolean().optional(),
});

export const saveAsset = inventarioAction
  .inputSchema(saveSchema)
  .action(async ({ parsedInput, ctx }) => {
    if (!isAssetKind(parsedInput.kind)) {
      throw new ActionError("Tipo de máquina inválido.");
    }
    await ownedClient(ctx.organizationId, parsedInput.clientId);

    const payload = {
      clientId: parsedInput.clientId,
      hostname: parsedInput.hostname,
      serial: parsedInput.serial || null,
      kind: parsedInput.kind,
      os: parsedInput.os || null,
      ip: parsedInput.ip || null,
      mac: parsedInput.mac || null,
      location: parsedInput.location || null,
      notes: parsedInput.notes || null,
      active: parsedInput.active ?? true,
      updatedAt: new Date(),
    };

    if (parsedInput.id) {
      await ownedAsset(ctx.organizationId, parsedInput.id);
      await db
        .update(asset)
        .set(payload)
        .where(
          and(
            eq(asset.id, parsedInput.id),
            eq(asset.organizationId, ctx.organizationId)
          )
        );
      return { id: parsedInput.id };
    }

    const id = crypto.randomUUID();
    await db.insert(asset).values({
      id,
      organizationId: ctx.organizationId,
      agentToken: createAgentToken(),
      agentStatus: "desconhecido",
      createdAt: new Date(),
      ...payload,
    });
    return { id };
  });

export const deleteAsset = inventarioAction
  .inputSchema(z.object({ id: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    await ownedAsset(ctx.organizationId, parsedInput.id);
    await db
      .delete(asset)
      .where(
        and(
          eq(asset.id, parsedInput.id),
          eq(asset.organizationId, ctx.organizationId)
        )
      );
    return { ok: true };
  });

export const rotateAgentToken = inventarioAction
  .inputSchema(z.object({ id: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    await ownedAsset(ctx.organizationId, parsedInput.id);
    const agentToken = createAgentToken();
    await db
      .update(asset)
      .set({
        agentToken,
        agentStatus: "desconhecido",
        agentVersion: null,
        lastSeenAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(asset.id, parsedInput.id),
          eq(asset.organizationId, ctx.organizationId)
        )
      );
    return { agentToken };
  });

export const getAssetInventory = inventarioAction
  .inputSchema(z.object({ id: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    await ownedAsset(ctx.organizationId, parsedInput.id);
    const [row] = await db
      .select()
      .from(assetInventory)
      .where(
        and(
          eq(assetInventory.assetId, parsedInput.id),
          eq(assetInventory.organizationId, ctx.organizationId)
        )
      )
      .limit(1);

    if (!row) return null;

    const payload = { ...(row.payload as Record<string, unknown>) };
    const system = { ...((payload.system as Record<string, unknown>) ?? {}) };
    const cipher = typeof system.windowsKey === "string" ? system.windowsKey : "";
    if (cipher.startsWith("v1:")) {
      try {
        system.windowsKey = decryptSecret(cipher);
      } catch {
        system.windowsKey = "—";
      }
    }
    payload.system = system;

    return {
      collectedAt: row.collectedAt,
      payload,
    };
  });

export const connectMeshSession = inventarioAction
  .inputSchema(z.object({ id: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    const owned = await ownedAsset(ctx.organizationId, parsedInput.id);
    const { createMeshLoginToken, findMeshNodeId, getMeshSettings, meshViewerUrl } = await import(
      "@/lib/meshcentral"
    );
    const mesh = getMeshSettings();
    if (!mesh.enabled) {
      throw new ActionError(
        "O acesso remoto ainda não está configurado no servidor (MeshCentral)."
      );
    }

    const nodeId = await findMeshNodeId(owned.hostname, owned.id);
    if (nodeId && nodeId !== owned.meshNodeId) {
      await db
        .update(asset)
        .set({ meshNodeId: nodeId, updatedAt: new Date() })
        .where(eq(asset.id, owned.id));
    }

    if (!nodeId) {
      throw new ActionError(
        "O agente remoto ainda não vinculou esta máquina. Aguarde um minuto e tente de novo."
      );
    }

    return { url: meshViewerUrl(mesh, nodeId, await createMeshLoginToken(mesh)) };
  });
