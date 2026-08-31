"use server";

import { and, desc, eq, inArray, isNull, like, or } from "drizzle-orm";
import { z } from "zod";

import {
  canChangeStatus,
  isTicketCategory,
  isTicketPriority,
  isTicketStatus,
  openTicketStatuses,
  ticketLabel,
  ticketCategories,
  ticketPriorities,
  ticketStatuses,
  type TicketStatus,
} from "@/config/tickets";
import { db } from "@/db";
import {
  client,
  clientContact,
  kbArticle,
  operator,
  ticket,
  ticketComment,
  ticketEvent,
  ticketKbArticle,
  user,
} from "@/db/schema";
import { ActionError, moduleAction } from "@/lib/safe-action";

const ticketsAction = moduleAction("tickets");

async function nextTicketNumber(organizationId: string) {
  const year = new Date().getFullYear();
  const prefix = `TKT-${year}-`;
  const [last] = await db
    .select({ number: ticket.number })
    .from(ticket)
    .where(
      and(eq(ticket.organizationId, organizationId), like(ticket.number, `${prefix}%`))
    )
    .orderBy(desc(ticket.number))
    .limit(1);

  const seq = last ? Number.parseInt(last.number.slice(prefix.length), 10) + 1 : 1;
  const next = Number.isFinite(seq) && seq > 0 ? seq : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

async function addEvent(input: {
  organizationId: string;
  ticketId: string;
  userId: string;
  kind: string;
  summary: string;
}) {
  await db.insert(ticketEvent).values({
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    ticketId: input.ticketId,
    userId: input.userId,
    kind: input.kind,
    summary: input.summary,
    createdAt: new Date(),
  });
}

async function ownedTicket(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(ticket)
    .where(and(eq(ticket.id, id), eq(ticket.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new ActionError("Ticket não encontrado.");
  return row;
}

export const listTicketOptions = ticketsAction.action(async ({ ctx }) => {
  const [clients, contacts, operators] = await Promise.all([
    db
      .select({ id: client.id, name: client.name, active: client.active, code: client.code })
      .from(client)
      .where(eq(client.organizationId, ctx.organizationId))
      .orderBy(client.name),
    db
      .select({
        id: clientContact.id,
        clientId: clientContact.clientId,
        name: clientContact.name,
        active: clientContact.active,
      })
      .from(clientContact)
      .where(eq(clientContact.organizationId, ctx.organizationId))
      .orderBy(clientContact.name),
    db
      .select({
        id: operator.id,
        name: operator.name,
        active: operator.active,
      })
      .from(operator)
      .where(eq(operator.organizationId, ctx.organizationId))
      .orderBy(operator.name),
  ]);

  return { clients, contacts, operators };
});

export const listTickets = ticketsAction
  .inputSchema(
    z.object({
      status: z.string().optional(),
      priority: z.string().optional(),
      clientId: z.string().optional(),
      operatorId: z.string().optional(),
      unassigned: z.boolean().optional(),
      queue: z.string().optional(),
    })
  )
  .action(async ({ parsedInput, ctx }) => {
    const filters = [eq(ticket.organizationId, ctx.organizationId)];
    if (parsedInput.status && isTicketStatus(parsedInput.status)) {
      filters.push(eq(ticket.status, parsedInput.status));
    } else if (parsedInput.queue === "aberta") {
      filters.push(inArray(ticket.status, [...openTicketStatuses]));
    }
    if (parsedInput.priority && isTicketPriority(parsedInput.priority)) {
      filters.push(eq(ticket.priority, parsedInput.priority));
    }
    if (parsedInput.clientId) {
      filters.push(eq(ticket.clientId, parsedInput.clientId));
    }
    if (parsedInput.unassigned) {
      filters.push(isNull(ticket.operatorId));
    } else if (parsedInput.operatorId) {
      filters.push(eq(ticket.operatorId, parsedInput.operatorId));
    }

    return db
      .select({
        id: ticket.id,
        number: ticket.number,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category,
        createdAt: ticket.createdAt,
        clientName: client.name,
        operatorName: operator.name,
      })
      .from(ticket)
      .innerJoin(client, eq(ticket.clientId, client.id))
      .leftJoin(operator, eq(ticket.operatorId, operator.id))
      .where(and(...filters))
      .orderBy(desc(ticket.createdAt));
  });

export const getTicket = ticketsAction
  .inputSchema(z.object({ id: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    const [row] = await db
      .select({
        id: ticket.id,
        number: ticket.number,
        title: ticket.title,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category,
        clientId: ticket.clientId,
        contactId: ticket.contactId,
        operatorId: ticket.operatorId,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        resolvedAt: ticket.resolvedAt,
        closedAt: ticket.closedAt,
        clientName: client.name,
        contactName: clientContact.name,
        operatorName: operator.name,
        createdByName: user.name,
      })
      .from(ticket)
      .innerJoin(client, eq(ticket.clientId, client.id))
      .leftJoin(clientContact, eq(ticket.contactId, clientContact.id))
      .leftJoin(operator, eq(ticket.operatorId, operator.id))
      .innerJoin(user, eq(ticket.createdByUserId, user.id))
      .where(
        and(eq(ticket.id, parsedInput.id), eq(ticket.organizationId, ctx.organizationId))
      )
      .limit(1);

    if (!row) {
      throw new ActionError("Ticket não encontrado.");
    }

    const [comments, events] = await Promise.all([
      db
        .select({
          id: ticketComment.id,
          body: ticketComment.body,
          createdAt: ticketComment.createdAt,
          userName: user.name,
        })
        .from(ticketComment)
        .innerJoin(user, eq(ticketComment.userId, user.id))
        .where(
          and(
            eq(ticketComment.ticketId, row.id),
            eq(ticketComment.organizationId, ctx.organizationId)
          )
        )
        .orderBy(ticketComment.createdAt),
      db
        .select({
          id: ticketEvent.id,
          kind: ticketEvent.kind,
          summary: ticketEvent.summary,
          createdAt: ticketEvent.createdAt,
          userName: user.name,
        })
        .from(ticketEvent)
        .leftJoin(user, eq(ticketEvent.userId, user.id))
        .where(
          and(
            eq(ticketEvent.ticketId, row.id),
            eq(ticketEvent.organizationId, ctx.organizationId)
          )
        )
        .orderBy(ticketEvent.createdAt),
    ]);

    return { ...row, comments, events };
  });

export const createTicket = ticketsAction
  .inputSchema(
    z.object({
      clientId: z.string().min(1, "Selecione o cliente."),
      contactId: z.string().optional(),
      operatorId: z.string().optional(),
      title: z.string().trim().min(3, "Informe o título."),
      description: z.string().trim().optional(),
      category: z.string(),
      priority: z.string(),
    })
  )
  .action(async ({ parsedInput, ctx }) => {
    if (!isTicketCategory(parsedInput.category)) {
      throw new ActionError("Categoria inválida.");
    }
    if (!isTicketPriority(parsedInput.priority)) {
      throw new ActionError("Prioridade inválida.");
    }

    const [ownedClient] = await db
      .select({ id: client.id, name: client.name })
      .from(client)
      .where(
        and(
          eq(client.id, parsedInput.clientId),
          eq(client.organizationId, ctx.organizationId)
        )
      )
      .limit(1);
    if (!ownedClient) throw new ActionError("Cliente inválido.");

    let contactName: string | null = null;
    if (parsedInput.contactId) {
      const [ownedContact] = await db
        .select({ id: clientContact.id, name: clientContact.name })
        .from(clientContact)
        .where(
          and(
            eq(clientContact.id, parsedInput.contactId),
            eq(clientContact.clientId, parsedInput.clientId),
            eq(clientContact.organizationId, ctx.organizationId)
          )
        )
        .limit(1);
      if (!ownedContact) throw new ActionError("Contato inválido para este cliente.");
      contactName = ownedContact.name;
    }

    let operatorName: string | null = null;
    if (parsedInput.operatorId) {
      const [ownedOperator] = await db
        .select({ id: operator.id, name: operator.name })
        .from(operator)
        .where(
          and(
            eq(operator.id, parsedInput.operatorId),
            eq(operator.organizationId, ctx.organizationId)
          )
        )
        .limit(1);
      if (!ownedOperator) throw new ActionError("Operador inválido.");
      operatorName = ownedOperator.name;
    }

    const id = crypto.randomUUID();
    const number = await nextTicketNumber(ctx.organizationId);
    const now = new Date();

    await db.insert(ticket).values({
      id,
      organizationId: ctx.organizationId,
      number,
      clientId: parsedInput.clientId,
      contactId: parsedInput.contactId || null,
      operatorId: parsedInput.operatorId || null,
      createdByUserId: ctx.session.user.id,
      title: parsedInput.title,
      description: parsedInput.description || null,
      category: parsedInput.category,
      priority: parsedInput.priority,
      status: "aberto",
      createdAt: now,
      updatedAt: now,
    });

    const bits = [`Ticket ${number} aberto para ${ownedClient.name}`];
    if (contactName) bits.push(`contato ${contactName}`);
    if (operatorName) bits.push(`atribuído a ${operatorName}`);

    await addEvent({
      organizationId: ctx.organizationId,
      ticketId: id,
      userId: ctx.session.user.id,
      kind: "created",
      summary: bits.join(" · "),
    });

    return { id, number };
  });

export const updateTicket = ticketsAction
  .inputSchema(
    z.object({
      id: z.string(),
      operatorId: z.string().nullable().optional(),
      contactId: z.string().nullable().optional(),
      priority: z.string().optional(),
      category: z.string().optional(),
    })
  )
  .action(async ({ parsedInput, ctx }) => {
    const current = await ownedTicket(ctx.organizationId, parsedInput.id);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const events: string[] = [];

    if (parsedInput.priority && parsedInput.priority !== current.priority) {
      if (!isTicketPriority(parsedInput.priority)) {
        throw new ActionError("Prioridade inválida.");
      }
      patch.priority = parsedInput.priority;
      events.push(
        `Prioridade: ${ticketLabel(ticketPriorities, current.priority)} → ${ticketLabel(ticketPriorities, parsedInput.priority)}`
      );
    }

    if (parsedInput.category && parsedInput.category !== current.category) {
      if (!isTicketCategory(parsedInput.category)) {
        throw new ActionError("Categoria inválida.");
      }
      patch.category = parsedInput.category;
      events.push(
        `Categoria: ${ticketLabel(ticketCategories, current.category)} → ${ticketLabel(ticketCategories, parsedInput.category)}`
      );
    }

    if (parsedInput.operatorId !== undefined) {
      const nextId = parsedInput.operatorId || null;
      if (nextId !== current.operatorId) {
        let name = "ninguém";
        if (nextId) {
          const [ownedOperator] = await db
            .select({ name: operator.name })
            .from(operator)
            .where(
              and(
                eq(operator.id, nextId),
                eq(operator.organizationId, ctx.organizationId)
              )
            )
            .limit(1);
          if (!ownedOperator) throw new ActionError("Operador inválido.");
          name = ownedOperator.name;
        }
        patch.operatorId = nextId;
        events.push(`Operador: ${name}`);
      }
    }

    if (parsedInput.contactId !== undefined) {
      const nextId = parsedInput.contactId || null;
      if (nextId !== current.contactId) {
        let name = "nenhum";
        if (nextId) {
          const [ownedContact] = await db
            .select({ name: clientContact.name })
            .from(clientContact)
            .where(
              and(
                eq(clientContact.id, nextId),
                eq(clientContact.clientId, current.clientId),
                eq(clientContact.organizationId, ctx.organizationId)
              )
            )
            .limit(1);
          if (!ownedContact) throw new ActionError("Contato inválido.");
          name = ownedContact.name;
        }
        patch.contactId = nextId;
        events.push(`Contato: ${name}`);
      }
    }

    if (events.length) {
      await db
        .update(ticket)
        .set(patch)
        .where(
          and(eq(ticket.id, current.id), eq(ticket.organizationId, ctx.organizationId))
        );
      await addEvent({
        organizationId: ctx.organizationId,
        ticketId: current.id,
        userId: ctx.session.user.id,
        kind: "field",
        summary: events.join(" · "),
      });
    }

    return { ok: true };
  });

export const changeTicketStatus = ticketsAction
  .inputSchema(z.object({ id: z.string(), status: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    if (!isTicketStatus(parsedInput.status)) {
      throw new ActionError("Status inválido.");
    }
    const current = await ownedTicket(ctx.organizationId, parsedInput.id);
    if (!isTicketStatus(current.status)) {
      throw new ActionError("Status atual inválido.");
    }
    if (current.status === parsedInput.status) {
      return { ok: true };
    }
    if (!canChangeStatus(current.status, parsedInput.status)) {
      throw new ActionError("Essa transição de status não é permitida.");
    }

    const now = new Date();
    const patch: {
      status: TicketStatus;
      updatedAt: Date;
      resolvedAt?: Date | null;
      closedAt?: Date | null;
    } = {
      status: parsedInput.status,
      updatedAt: now,
    };

    if (parsedInput.status === "resolvido") {
      patch.resolvedAt = now;
      patch.closedAt = null;
    } else if (parsedInput.status === "fechado") {
      patch.closedAt = now;
      if (!current.resolvedAt) patch.resolvedAt = now;
    } else if (current.status === "fechado" || current.status === "resolvido") {
      patch.resolvedAt = null;
      patch.closedAt = null;
    }

    await db
      .update(ticket)
      .set(patch)
      .where(
        and(eq(ticket.id, current.id), eq(ticket.organizationId, ctx.organizationId))
      );

    await addEvent({
      organizationId: ctx.organizationId,
      ticketId: current.id,
      userId: ctx.session.user.id,
      kind: "status",
      summary: `Status: ${ticketLabel(ticketStatuses, current.status)} → ${ticketLabel(ticketStatuses, parsedInput.status)}`,
    });

    return { ok: true };
  });

export const addTicketComment = ticketsAction
  .inputSchema(
    z.object({
      id: z.string(),
      body: z.string().trim().min(1, "Escreva um comentário."),
    })
  )
  .action(async ({ parsedInput, ctx }) => {
    const current = await ownedTicket(ctx.organizationId, parsedInput.id);
    const now = new Date();

    await db.insert(ticketComment).values({
      id: crypto.randomUUID(),
      organizationId: ctx.organizationId,
      ticketId: current.id,
      userId: ctx.session.user.id,
      body: parsedInput.body,
      createdAt: now,
    });

    await db
      .update(ticket)
      .set({ updatedAt: now })
      .where(
        and(eq(ticket.id, current.id), eq(ticket.organizationId, ctx.organizationId))
      );

    await addEvent({
      organizationId: ctx.organizationId,
      ticketId: current.id,
      userId: ctx.session.user.id,
      kind: "comment",
      summary: "Comentário adicionado",
    });

    return { ok: true };
  });

export const listTicketKnowledge = ticketsAction
  .inputSchema(z.object({ ticketId: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    const current = await ownedTicket(ctx.organizationId, parsedInput.ticketId);

    const [articles, links] = await Promise.all([
      db
        .select({
          id: kbArticle.id,
          title: kbArticle.title,
          body: kbArticle.body,
          category: kbArticle.category,
          clientId: kbArticle.clientId,
          clientName: client.name,
          updatedAt: kbArticle.updatedAt,
        })
        .from(kbArticle)
        .leftJoin(client, eq(kbArticle.clientId, client.id))
        .where(
          and(
            eq(kbArticle.organizationId, ctx.organizationId),
            or(isNull(kbArticle.clientId), eq(kbArticle.clientId, current.clientId))
          )
        )
        .orderBy(desc(kbArticle.updatedAt)),
      db
        .select({ articleId: ticketKbArticle.articleId })
        .from(ticketKbArticle)
        .where(
          and(
            eq(ticketKbArticle.ticketId, current.id),
            eq(ticketKbArticle.organizationId, ctx.organizationId)
          )
        ),
    ]);

    const linkedIds = new Set(links.map((item) => item.articleId));
    return articles.map((item) => ({
      ...item,
      linked: linkedIds.has(item.id),
      general: !item.clientId,
    }));
  });

export const attachTicketArticle = ticketsAction
  .inputSchema(
    z.object({
      ticketId: z.string(),
      articleId: z.string(),
    })
  )
  .action(async ({ parsedInput, ctx }) => {
    const current = await ownedTicket(ctx.organizationId, parsedInput.ticketId);
    const [article] = await db
      .select({
        id: kbArticle.id,
        title: kbArticle.title,
        clientId: kbArticle.clientId,
      })
      .from(kbArticle)
      .where(
        and(
          eq(kbArticle.id, parsedInput.articleId),
          eq(kbArticle.organizationId, ctx.organizationId)
        )
      )
      .limit(1);

    if (!article) throw new ActionError("Artigo não encontrado.");
    if (article.clientId && article.clientId !== current.clientId) {
      throw new ActionError("Este artigo é de outro cliente.");
    }

    const [existing] = await db
      .select({ id: ticketKbArticle.id })
      .from(ticketKbArticle)
      .where(
        and(
          eq(ticketKbArticle.ticketId, current.id),
          eq(ticketKbArticle.articleId, article.id)
        )
      )
      .limit(1);

    if (!existing) {
      await db.insert(ticketKbArticle).values({
        id: crypto.randomUUID(),
        organizationId: ctx.organizationId,
        ticketId: current.id,
        articleId: article.id,
        createdAt: new Date(),
      });
      await addEvent({
        organizationId: ctx.organizationId,
        ticketId: current.id,
        userId: ctx.session.user.id,
        kind: "knowledge",
        summary: `Artigo vinculado: ${article.title}`,
      });
    }

    return { ok: true };
  });

export const detachTicketArticle = ticketsAction
  .inputSchema(
    z.object({
      ticketId: z.string(),
      articleId: z.string(),
    })
  )
  .action(async ({ parsedInput, ctx }) => {
    const current = await ownedTicket(ctx.organizationId, parsedInput.ticketId);
    const [article] = await db
      .select({ title: kbArticle.title })
      .from(kbArticle)
      .where(
        and(
          eq(kbArticle.id, parsedInput.articleId),
          eq(kbArticle.organizationId, ctx.organizationId)
        )
      )
      .limit(1);

    await db
      .delete(ticketKbArticle)
      .where(
        and(
          eq(ticketKbArticle.ticketId, current.id),
          eq(ticketKbArticle.articleId, parsedInput.articleId),
          eq(ticketKbArticle.organizationId, ctx.organizationId)
        )
      );

    await addEvent({
      organizationId: ctx.organizationId,
      ticketId: current.id,
      userId: ctx.session.user.id,
      kind: "knowledge",
      summary: `Artigo desvinculado: ${article?.title ?? "procedimento"}`,
    });

    return { ok: true };
  });
