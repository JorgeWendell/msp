"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { isKbCategory } from "@/config/conhecimento";
import { db } from "@/db";
import { client, kbArticle, user } from "@/db/schema";
import { ActionError, moduleAction } from "@/lib/safe-action";

const conhecimentoAction = moduleAction("conhecimento");

async function ownedArticle(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(kbArticle)
    .where(and(eq(kbArticle.id, id), eq(kbArticle.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new ActionError("Artigo não encontrado.");
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

export const listKnowledgeClients = conhecimentoAction.action(async ({ ctx }) => {
  return db
    .select({ id: client.id, name: client.name, active: client.active, code: client.code })
    .from(client)
    .where(eq(client.organizationId, ctx.organizationId))
    .orderBy(client.name);
});

export const listArticles = conhecimentoAction
  .inputSchema(
    z.object({
      clientId: z.string().optional(),
      category: z.string().optional(),
    })
  )
  .action(async ({ parsedInput, ctx }) => {
    const filters = [eq(kbArticle.organizationId, ctx.organizationId)];
    if (parsedInput.clientId === "geral") {
      filters.push(isNull(kbArticle.clientId));
    } else if (parsedInput.clientId) {
      filters.push(eq(kbArticle.clientId, parsedInput.clientId));
    }
    if (parsedInput.category && isKbCategory(parsedInput.category)) {
      filters.push(eq(kbArticle.category, parsedInput.category));
    }

    return db
      .select({
        id: kbArticle.id,
        title: kbArticle.title,
        category: kbArticle.category,
        clientId: kbArticle.clientId,
        clientName: client.name,
        updatedAt: kbArticle.updatedAt,
      })
      .from(kbArticle)
      .leftJoin(client, eq(kbArticle.clientId, client.id))
      .where(and(...filters))
      .orderBy(desc(kbArticle.updatedAt));
  });

export const getArticle = conhecimentoAction
  .inputSchema(z.object({ id: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    const [row] = await db
      .select({
        id: kbArticle.id,
        title: kbArticle.title,
        body: kbArticle.body,
        category: kbArticle.category,
        clientId: kbArticle.clientId,
        clientName: client.name,
        createdByName: user.name,
        createdAt: kbArticle.createdAt,
        updatedAt: kbArticle.updatedAt,
      })
      .from(kbArticle)
      .leftJoin(client, eq(kbArticle.clientId, client.id))
      .innerJoin(user, eq(kbArticle.createdByUserId, user.id))
      .where(
        and(
          eq(kbArticle.id, parsedInput.id),
          eq(kbArticle.organizationId, ctx.organizationId)
        )
      )
      .limit(1);

    if (!row) throw new ActionError("Artigo não encontrado.");
    return row;
  });

const saveSchema = z.object({
  id: z.string().optional(),
  clientId: z.string().optional(),
  title: z.string().trim().min(1, "Informe o título."),
  body: z.string().trim().min(1, "Informe o conteúdo."),
  category: z.string(),
});

export const saveArticle = conhecimentoAction
  .inputSchema(saveSchema)
  .action(async ({ parsedInput, ctx }) => {
    if (!isKbCategory(parsedInput.category)) {
      throw new ActionError("Categoria inválida.");
    }

    const clientId = parsedInput.clientId || null;
    if (clientId) {
      await ownedClient(ctx.organizationId, clientId);
    }

    const payload = {
      clientId,
      title: parsedInput.title,
      body: parsedInput.body,
      category: parsedInput.category,
      updatedAt: new Date(),
    };

    if (parsedInput.id) {
      await ownedArticle(ctx.organizationId, parsedInput.id);
      await db
        .update(kbArticle)
        .set(payload)
        .where(
          and(
            eq(kbArticle.id, parsedInput.id),
            eq(kbArticle.organizationId, ctx.organizationId)
          )
        );
      return { id: parsedInput.id };
    }

    const id = crypto.randomUUID();
    await db.insert(kbArticle).values({
      id,
      organizationId: ctx.organizationId,
      createdByUserId: ctx.session.user.id,
      createdAt: new Date(),
      ...payload,
    });
    return { id };
  });

export const deleteArticle = conhecimentoAction
  .inputSchema(z.object({ id: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    await ownedArticle(ctx.organizationId, parsedInput.id);
    await db
      .delete(kbArticle)
      .where(
        and(
          eq(kbArticle.id, parsedInput.id),
          eq(kbArticle.organizationId, ctx.organizationId)
        )
      );
    return { ok: true };
  });
