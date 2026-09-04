"use server";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  createAgentToken,
  isAssetKind,
  isAgentStatus,
} from "@/config/inventario";
import { db } from "@/db";
import { asset, assetInventory, client } from "@/db/schema";
import { inventoryScopeClientId } from "@/lib/access";
import {
  expireStaleAgentStatus,
  resolveAgentStatus,
} from "@/lib/agent-presence";
import { lanIpFromInventory } from "@/lib/lan-ip";
import { ActionError, moduleAction } from "@/lib/safe-action";
import { decryptSecret } from "@/lib/vault-crypto";

const inventarioAction = moduleAction("inventario");

async function ownedAsset(
  organizationId: string,
  id: string,
  scopeClientId?: string | null
) {
  const filters = [eq(asset.id, id), eq(asset.organizationId, organizationId)];
  if (scopeClientId) {
    filters.push(eq(asset.clientId, scopeClientId));
  }
  const [row] = await db
    .select()
    .from(asset)
    .where(and(...filters))
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
  const scope = inventoryScopeClientId(ctx.access);
  const filters = [eq(client.organizationId, ctx.organizationId)];
  if (scope) {
    filters.push(eq(client.id, scope));
  }
  const clients = await db
    .select({
      id: client.id,
      name: client.name,
      active: client.active,
      code: client.code,
    })
    .from(client)
    .where(and(...filters))
    .orderBy(client.name);
  return {
    clients,
    restrictedToClientId: scope,
  };
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
    const scope = inventoryScopeClientId(ctx.access);
    if (scope && parsedInput.clientId && parsedInput.clientId !== scope) {
      throw new ActionError("Você só pode ver as máquinas deste cliente.");
    }
    const filters = [eq(asset.organizationId, ctx.organizationId)];
    const clientId = scope ?? parsedInput.clientId;
    if (clientId) {
      filters.push(eq(asset.clientId, clientId));
    }
    if (parsedInput.kind && isAssetKind(parsedInput.kind)) {
      filters.push(eq(asset.kind, parsedInput.kind));
    }
    await expireStaleAgentStatus(ctx.organizationId);
    if (parsedInput.agentStatus && isAgentStatus(parsedInput.agentStatus)) {
      filters.push(eq(asset.agentStatus, parsedInput.agentStatus));
    }

    const rows = await db
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
        inventoryPayload: assetInventory.payload,
      })
      .from(asset)
      .innerJoin(client, eq(asset.clientId, client.id))
      .leftJoin(assetInventory, eq(assetInventory.assetId, asset.id))
      .where(and(...filters))
      .orderBy(desc(asset.createdAt));

    return rows.map((row) => {
      const { inventoryPayload, ...assetRow } = row;
      return {
        ...assetRow,
        ip: lanIpFromInventory(inventoryPayload, row.ip),
        agentStatus: resolveAgentStatus(row.agentStatus, row.lastSeenAt),
      };
    });
  });

export const getAsset = inventarioAction
  .inputSchema(z.object({ id: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    const scope = inventoryScopeClientId(ctx.access);
    await expireStaleAgentStatus(ctx.organizationId);
    const filters = [
      eq(asset.id, parsedInput.id),
      eq(asset.organizationId, ctx.organizationId),
    ];
    if (scope) {
      filters.push(eq(asset.clientId, scope));
    }
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
        inventoryPayload: assetInventory.payload,
      })
      .from(asset)
      .innerJoin(client, eq(asset.clientId, client.id))
      .leftJoin(assetInventory, eq(assetInventory.assetId, asset.id))
      .where(and(...filters))
      .limit(1);

    if (!row) throw new ActionError("Máquina não encontrada.");
    const { inventoryPayload, ...assetRow } = row;
    return {
      ...assetRow,
      ip: lanIpFromInventory(inventoryPayload, row.ip),
      agentStatus: resolveAgentStatus(row.agentStatus, row.lastSeenAt),
    };
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
    const scope = inventoryScopeClientId(ctx.access);
    if (scope && parsedInput.clientId !== scope) {
      throw new ActionError("Você só pode cadastrar máquinas deste cliente.");
    }
    const clientId = scope ?? parsedInput.clientId;
    await ownedClient(ctx.organizationId, clientId);

    const payload = {
      clientId,
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
      await ownedAsset(ctx.organizationId, parsedInput.id, scope);
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
    await ownedAsset(
      ctx.organizationId,
      parsedInput.id,
      inventoryScopeClientId(ctx.access)
    );
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
    await ownedAsset(
      ctx.organizationId,
      parsedInput.id,
      inventoryScopeClientId(ctx.access)
    );
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
    await ownedAsset(
      ctx.organizationId,
      parsedInput.id,
      inventoryScopeClientId(ctx.access)
    );
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
    const owned = await ownedAsset(
      ctx.organizationId,
      parsedInput.id,
      inventoryScopeClientId(ctx.access)
    );
    const {
      createMeshLoginToken,
      findMeshNodeId,
      getMeshSettings,
      listMeshDevices,
      meshViewerUrl,
      pickMeshNodeId,
    } = await import("@/lib/meshcentral");
    const mesh = getMeshSettings();
    if (!mesh.enabled) {
      throw new ActionError(
        "O acesso remoto ainda não está configurado no servidor (MeshCentral)."
      );
    }

    const devices = await listMeshDevices(mesh);
    if (devices === null && !owned.meshNodeId) {
      throw new ActionError(
        "O painel não autenticou no Mesh. Confira MESHCENTRAL_USER=suporte e MESHCENTRAL_PASS no .env do servidor e rode docker compose up -d de novo."
      );
    }

    const nodeId =
      (devices ? pickMeshNodeId(devices, owned.hostname, owned.id) : null) ||
      owned.meshNodeId ||
      (devices === null ? await findMeshNodeId(owned.hostname, owned.id) : null);
    if (nodeId && nodeId !== owned.meshNodeId) {
      await db
        .update(asset)
        .set({ meshNodeId: nodeId, updatedAt: new Date() })
        .where(eq(asset.id, owned.id));
    }

    if (!nodeId) {
      throw new ActionError(
        "A máquina ainda não apareceu em mesh.adelweb.com.br. No cliente, o arquivo AdelMsp.Remote.msh precisa ter MeshServer=wss://mesh.adelweb.com.br/agent.ashx. Rode o AdelMsp.exe como Administrador de novo."
      );
    }

    return { url: meshViewerUrl(mesh, nodeId, await createMeshLoginToken(mesh)) };
  });
