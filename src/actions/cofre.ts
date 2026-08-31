"use server";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { isVaultKind } from "@/config/cofre";
import { db } from "@/db";
import { asset, client, vaultItem } from "@/db/schema";
import { ActionError, moduleAction } from "@/lib/safe-action";
import { decryptSecret, encryptSecret } from "@/lib/vault-crypto";

const cofreAction = moduleAction("cofre");

async function ownedVaultItem(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(vaultItem)
    .where(and(eq(vaultItem.id, id), eq(vaultItem.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new ActionError("Registro do cofre não encontrado.");
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

async function ownedAsset(
  organizationId: string,
  clientId: string,
  assetId: string
) {
  const [row] = await db
    .select({ id: asset.id })
    .from(asset)
    .where(
      and(
        eq(asset.id, assetId),
        eq(asset.organizationId, organizationId),
        eq(asset.clientId, clientId)
      )
    )
    .limit(1);
  if (!row) throw new ActionError("Dispositivo inválido para este cliente.");
  return row;
}

export const listVaultOptions = cofreAction.action(async ({ ctx }) => {
  const [clients, assets] = await Promise.all([
    db
      .select({ id: client.id, name: client.name, active: client.active, code: client.code })
      .from(client)
      .where(eq(client.organizationId, ctx.organizationId))
      .orderBy(client.name),
    db
      .select({
        id: asset.id,
        hostname: asset.hostname,
        clientId: asset.clientId,
      })
      .from(asset)
      .where(eq(asset.organizationId, ctx.organizationId))
      .orderBy(asset.hostname),
  ]);
  return { clients, assets };
});

export const listVaultItems = cofreAction
  .inputSchema(
    z.object({
      clientId: z.string().optional(),
      kind: z.string().optional(),
    })
  )
  .action(async ({ parsedInput, ctx }) => {
    const filters = [eq(vaultItem.organizationId, ctx.organizationId)];
    if (parsedInput.clientId) {
      filters.push(eq(vaultItem.clientId, parsedInput.clientId));
    }
    if (parsedInput.kind && isVaultKind(parsedInput.kind)) {
      filters.push(eq(vaultItem.kind, parsedInput.kind));
    }

    return db
      .select({
        id: vaultItem.id,
        title: vaultItem.title,
        kind: vaultItem.kind,
        username: vaultItem.username,
        url: vaultItem.url,
        notes: vaultItem.notes,
        clientId: vaultItem.clientId,
        assetId: vaultItem.assetId,
        clientName: client.name,
        assetHostname: asset.hostname,
        updatedAt: vaultItem.updatedAt,
      })
      .from(vaultItem)
      .innerJoin(client, eq(vaultItem.clientId, client.id))
      .leftJoin(asset, eq(vaultItem.assetId, asset.id))
      .where(and(...filters))
      .orderBy(desc(vaultItem.updatedAt));
  });

const saveSchema = z.object({
  id: z.string().optional(),
  clientId: z.string().min(1, "Selecione o cliente."),
  assetId: z.string().optional(),
  kind: z.string(),
  title: z.string().trim().min(1, "Informe o título."),
  username: z.string().trim().optional(),
  password: z.string().optional(),
  url: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const saveVaultItem = cofreAction
  .inputSchema(saveSchema)
  .action(async ({ parsedInput, ctx }) => {
    if (!isVaultKind(parsedInput.kind)) {
      throw new ActionError("Tipo de acesso inválido.");
    }
    await ownedClient(ctx.organizationId, parsedInput.clientId);

    const assetId = parsedInput.assetId || null;
    if (assetId) {
      await ownedAsset(ctx.organizationId, parsedInput.clientId, assetId);
    }

    const payload = {
      clientId: parsedInput.clientId,
      assetId,
      kind: parsedInput.kind,
      title: parsedInput.title,
      username: parsedInput.username || null,
      url: parsedInput.url || null,
      notes: parsedInput.notes || null,
      updatedAt: new Date(),
    };

    if (parsedInput.id) {
      const current = await ownedVaultItem(ctx.organizationId, parsedInput.id);
      const password = parsedInput.password?.trim();
      await db
        .update(vaultItem)
        .set({
          ...payload,
          secret: password ? encryptSecret(password) : current.secret,
        })
        .where(
          and(
            eq(vaultItem.id, parsedInput.id),
            eq(vaultItem.organizationId, ctx.organizationId)
          )
        );
      return { id: parsedInput.id };
    }

    const password = parsedInput.password?.trim();
    if (!password) {
      throw new ActionError("Informe a senha.");
    }

    const id = crypto.randomUUID();
    await db.insert(vaultItem).values({
      id,
      organizationId: ctx.organizationId,
      secret: encryptSecret(password),
      createdAt: new Date(),
      ...payload,
    });
    return { id };
  });

export const deleteVaultItem = cofreAction
  .inputSchema(z.object({ id: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    await ownedVaultItem(ctx.organizationId, parsedInput.id);
    await db
      .delete(vaultItem)
      .where(
        and(
          eq(vaultItem.id, parsedInput.id),
          eq(vaultItem.organizationId, ctx.organizationId)
        )
      );
    return { ok: true };
  });

export const revealVaultSecret = cofreAction
  .inputSchema(z.object({ id: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    const row = await ownedVaultItem(ctx.organizationId, parsedInput.id);
    return { password: decryptSecret(row.secret) };
  });
