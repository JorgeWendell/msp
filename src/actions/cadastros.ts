"use server";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  erpModules,
  isInventoryOnlyProfiles,
  type ModuleProfile,
} from "@/config/modules";
import { getCadastro } from "@/config/cadastros";
import { db } from "@/db";
import {
  account,
  client,
  clientContact,
  member,
  memberModule,
  operator,
  organization,
  user,
} from "@/db/schema";
import { applyAccessPreset, canManageUsers, ensureMemberModules } from "@/lib/access";
import { auth } from "@/lib/auth";
import { createClientCode } from "@/lib/client-code";
import { ActionError, moduleAction } from "@/lib/safe-action";

const tables = {
  clientes: client,
  contatos: clientContact,
  operadores: operator,
} as const;

type CrudSlug = keyof typeof tables;

async function ownedClient(organizationId: string, clientId: string) {
  const [row] = await db
    .select({ id: client.id, name: client.name })
    .from(client)
    .where(and(eq(client.id, clientId), eq(client.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new ActionError("Cliente inválido.");
  return row;
}

async function setMemberClientScope(
  organizationId: string,
  memberId: string,
  clientId: string | null
) {
  await db
    .update(member)
    .set({ restrictedClientId: clientId })
    .where(
      and(eq(member.id, memberId), eq(member.organizationId, organizationId))
    );
}

function getTable(slug: CrudSlug) {
  // Generic CRUD; Drizzle unions collapse on intersect.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tables[slug] as any;
}

function isCrudSlug(value: string): value is CrudSlug {
  return value in tables;
}

const booleanFields = new Set(["active"]);

async function uniqueClientCode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = createClientCode();
    const [existing] = await db
      .select({ id: client.id })
      .from(client)
      .where(eq(client.code, code))
      .limit(1);
    if (!existing) return code;
  }
  throw new ActionError("Não foi possível gerar o código do cliente.");
}

function sanitizeData(
  slug: CrudSlug,
  data: Record<string, unknown>,
  organizationId: string
) {
  const def = getCadastro(slug);
  const allowed = new Set(
    (def?.fields ?? [])
      .filter((field) => !field.generated && !field.readonly)
      .map((field) => field.name)
  );
  const payload: Record<string, unknown> = {
    organizationId,
    updatedAt: new Date(),
  };

  for (const [key, value] of Object.entries(data)) {
    if (!allowed.has(key) || key === "id" || key === "organizationId") continue;

    if (booleanFields.has(key)) {
      payload[key] = value === true || value === "true" || value === "on";
      continue;
    }

    if (typeof value === "string" && value.trim() === "") {
      payload[key] = null;
      continue;
    }

    payload[key] = value;
  }

  return payload;
}

export const listCadastro = moduleAction("cadastros")
  .inputSchema(z.object({ slug: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    const def = getCadastro(parsedInput.slug);

    if (!def || def.kind !== "crud" || !isCrudSlug(parsedInput.slug)) {
      throw new ActionError("Cadastro inválido.");
    }

    if (parsedInput.slug === "contatos") {
      return db
        .select({
          id: clientContact.id,
          organizationId: clientContact.organizationId,
          clientId: clientContact.clientId,
          clientName: client.name,
          name: clientContact.name,
          role: clientContact.role,
          email: clientContact.email,
          phone: clientContact.phone,
          notes: clientContact.notes,
          active: clientContact.active,
          createdAt: clientContact.createdAt,
          updatedAt: clientContact.updatedAt,
        })
        .from(clientContact)
        .innerJoin(client, eq(clientContact.clientId, client.id))
        .where(eq(clientContact.organizationId, ctx.organizationId))
        .orderBy(desc(clientContact.createdAt));
    }

    const table = getTable(parsedInput.slug);

    return db
      .select()
      .from(table)
      .where(eq(table.organizationId, ctx.organizationId))
      .orderBy(desc(table.createdAt));
  });

export const saveCadastro = moduleAction("cadastros")
  .inputSchema(
    z.object({
      slug: z.string(),
      id: z.string().optional(),
      data: z.record(z.string(), z.unknown()),
    })
  )
  .action(async ({ parsedInput, ctx }) => {
    const def = getCadastro(parsedInput.slug);

    if (!def || def.kind !== "crud" || !isCrudSlug(parsedInput.slug)) {
      throw new ActionError("Cadastro inválido.");
    }

    if (parsedInput.slug === "contatos") {
      const clientId = String(parsedInput.data.clientId ?? "");
      if (!clientId) {
        throw new ActionError("Selecione o cliente.");
      }
      const [owned] = await db
        .select({ id: client.id })
        .from(client)
        .where(
          and(eq(client.id, clientId), eq(client.organizationId, ctx.organizationId))
        )
        .limit(1);
      if (!owned) {
        throw new ActionError("Cliente inválido.");
      }
    }

    const table = getTable(parsedInput.slug);
    const payload = sanitizeData(
      parsedInput.slug,
      parsedInput.data,
      ctx.organizationId
    );

    if (parsedInput.id) {
      await db
        .update(table)
        .set(payload)
        .where(
          and(
            eq(table.id, parsedInput.id),
            eq(table.organizationId, ctx.organizationId)
          )
        );
      return { id: parsedInput.id };
    }

    const id = crypto.randomUUID();
    if (parsedInput.slug === "clientes") {
      payload.code = await uniqueClientCode();
    }
    await db.insert(table).values({
      id,
      createdAt: new Date(),
      ...payload,
    });
    return { id, code: payload.code as string | undefined };
  });

export const deleteCadastro = moduleAction("cadastros")
  .inputSchema(z.object({ slug: z.string(), id: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    const def = getCadastro(parsedInput.slug);

    if (!def || def.kind !== "crud" || !isCrudSlug(parsedInput.slug)) {
      throw new ActionError("Cadastro inválido.");
    }

    const table = getTable(parsedInput.slug);
    await db
      .delete(table)
      .where(
        and(
          eq(table.id, parsedInput.id),
          eq(table.organizationId, ctx.organizationId)
        )
      );
    return { ok: true };
  });

export const listRelationOptions = moduleAction("cadastros")
  .inputSchema(z.object({ relation: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    if (parsedInput.relation !== "clientes") return [];

    const rows = await db
      .select({ id: client.id, name: client.name, code: client.code })
      .from(client)
      .where(eq(client.organizationId, ctx.organizationId))
      .orderBy(client.name);

    return rows.map((row) => ({
      id: row.id,
      label: row.code ? `${row.name} · ${row.code}` : row.name,
    }));
  });

export const getEmpresa = moduleAction("cadastros").action(async ({ ctx }) => {
  const [company] = await db
    .select()
    .from(organization)
    .where(eq(organization.id, ctx.organizationId))
    .limit(1);

  if (!company) {
    throw new ActionError("Empresa não encontrada.");
  }

  return company;
});

export const saveEmpresa = moduleAction("cadastros")
  .inputSchema(
    z.object({
      name: z.string().trim().min(2, "Informe a razão social."),
      tradeName: z.string().optional(),
      document: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      zip: z.string().optional(),
      address: z.string().optional(),
      addressNumber: z.string().optional(),
      complement: z.string().optional(),
      district: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
    })
  )
  .action(async ({ parsedInput, ctx }) => {
    await db
      .update(organization)
      .set({
        name: parsedInput.name,
        tradeName: parsedInput.tradeName || null,
        document: parsedInput.document || null,
        phone: parsedInput.phone || null,
        email: parsedInput.email || null,
        zip: parsedInput.zip || null,
        address: parsedInput.address || null,
        addressNumber: parsedInput.addressNumber || null,
        complement: parsedInput.complement || null,
        district: parsedInput.district || null,
        city: parsedInput.city || null,
        state: parsedInput.state || null,
        updatedAt: new Date(),
      })
      .where(eq(organization.id, ctx.organizationId));

    return { ok: true };
  });

export const listUsuarios = moduleAction("cadastros").action(async ({ ctx }) => {
  const [rows, clients] = await Promise.all([
    db
      .select({
        memberId: member.id,
        role: member.role,
        restrictedClientId: member.restrictedClientId,
        userId: user.id,
        name: user.name,
        email: user.email,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.organizationId, ctx.organizationId))
      .orderBy(user.name),
    db
      .select({ id: client.id, name: client.name, active: client.active })
      .from(client)
      .where(eq(client.organizationId, ctx.organizationId))
      .orderBy(client.name),
  ]);

  for (const row of rows) {
    const fallback =
      row.role === "owner"
        ? "administrador"
        : row.role === "admin"
          ? "gestor"
          : "usuario";
    await ensureMemberModules(ctx.organizationId, row.memberId, fallback);
  }

  const grants = await db
    .select({
      memberId: memberModule.memberId,
      moduleSlug: memberModule.moduleSlug,
      profile: memberModule.profile,
    })
    .from(memberModule)
    .where(eq(memberModule.organizationId, ctx.organizationId));

  const clientNameById = new Map(clients.map((item) => [item.id, item.name]));

  return {
    canManage: canManageUsers(ctx.access),
    clients,
    users: rows.map((row) => {
      const mine = grants.filter((item) => item.memberId === row.memberId);
      const bySlug = new Map(mine.map((item) => [item.moduleSlug, item.profile]));
      const modules = erpModules.map((item) => ({
        slug: item.slug,
        title: item.title,
        profile: (row.role === "owner"
          ? "administrador"
          : (bySlug.get(item.slug) ?? "usuario")) as ModuleProfile,
      }));
      return {
        ...row,
        modules,
        restrictedClientName: row.restrictedClientId
          ? (clientNameById.get(row.restrictedClientId) ?? null)
          : null,
      };
    }),
  };
});

export const saveUsuario = moduleAction("cadastros")
  .inputSchema(
    z.object({
      name: z.string().trim().min(2),
      email: z.email("Informe um e-mail válido."),
      password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres."),
      role: z.enum(["owner", "admin", "member"]).default("member"),
      initialProfile: z
        .enum(["administrador", "gestor", "usuario", "negado"])
        .default("usuario"),
      preset: z.enum(["todos", "inventario"]).default("todos"),
      clientId: z.string().optional(),
    })
  )
  .action(async ({ parsedInput, ctx }) => {
    if (!canManageUsers(ctx.access)) {
      throw new ActionError(
        "Somente administrador da empresa ou de Cadastros gerencia usuários."
      );
    }

    let restrictedClientId: string | null = null;
    if (parsedInput.preset === "inventario") {
      if (!parsedInput.clientId) {
        throw new ActionError("Selecione o cliente que este usuário poderá ver.");
      }
      await ownedClient(ctx.organizationId, parsedInput.clientId);
      restrictedClientId = parsedInput.clientId;
    }

    const [existing] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, parsedInput.email))
      .limit(1);

    if (existing) {
      throw new ActionError("Já existe um usuário com este e-mail.");
    }

    const context = await auth.$context;
    const hashed = await context.password.hash(parsedInput.password);
    const userId = crypto.randomUUID();
    const memberId = crypto.randomUUID();
    const now = new Date();

    await db.insert(user).values({
      id: userId,
      name: parsedInput.name,
      email: parsedInput.email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(account).values({
      id: crypto.randomUUID(),
      issuer: "local:credential",
      accountId: userId,
      providerId: "credential",
      userId,
      password: hashed,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(member).values({
      id: memberId,
      organizationId: ctx.organizationId,
      userId,
      role: parsedInput.role,
      restrictedClientId,
      createdAt: now,
    });

    await applyAccessPreset(
      ctx.organizationId,
      memberId,
      parsedInput.preset,
      parsedInput.initialProfile
    );

    return { id: userId };
  });

export const updateUsuarioRole = moduleAction("cadastros")
  .inputSchema(
    z.object({
      memberId: z.string(),
      role: z.enum(["owner", "admin", "member"]),
    })
  )
  .action(async ({ parsedInput, ctx }) => {
    if (!canManageUsers(ctx.access)) {
      throw new ActionError(
        "Somente administrador da empresa ou de Cadastros gerencia usuários."
      );
    }
    const patch: { role: typeof parsedInput.role; restrictedClientId?: string | null } =
      { role: parsedInput.role };
    if (parsedInput.role === "owner" || parsedInput.role === "admin") {
      patch.restrictedClientId = null;
    }
    await db
      .update(member)
      .set(patch)
      .where(
        and(
          eq(member.id, parsedInput.memberId),
          eq(member.organizationId, ctx.organizationId)
        )
      );
    return { ok: true };
  });

export const saveModuleAccess = moduleAction("cadastros")
  .inputSchema(
    z.object({
      memberId: z.string(),
      clientId: z.string().optional(),
      modules: z.array(
        z.object({
          slug: z.string(),
          profile: z.enum(["administrador", "gestor", "usuario", "negado"]),
        })
      ),
    })
  )
  .action(async ({ parsedInput, ctx }) => {
    if (!canManageUsers(ctx.access)) {
      throw new ActionError(
        "Somente administrador da empresa ou de Cadastros altera módulos."
      );
    }
    const [target] = await db
      .select({ id: member.id, role: member.role })
      .from(member)
      .where(
        and(
          eq(member.id, parsedInput.memberId),
          eq(member.organizationId, ctx.organizationId)
        )
      )
      .limit(1);
    if (!target) throw new ActionError("Usuário não encontrado.");
    if (target.role === "owner") {
      throw new ActionError(
        "O administrador da empresa tem acesso total a todos os módulos."
      );
    }

    await ensureMemberModules(ctx.organizationId, target.id, "usuario");
    const now = new Date();
    const allowed = new Set(erpModules.map((item) => item.slug));
    for (const item of parsedInput.modules) {
      if (!allowed.has(item.slug)) continue;
      await db
        .update(memberModule)
        .set({ profile: item.profile, updatedAt: now })
        .where(
          and(
            eq(memberModule.memberId, target.id),
            eq(memberModule.moduleSlug, item.slug),
            eq(memberModule.organizationId, ctx.organizationId)
          )
        );
    }

    if (target.role === "admin") {
      await setMemberClientScope(ctx.organizationId, target.id, null);
    } else if (isInventoryOnlyProfiles(parsedInput.modules)) {
      if (!parsedInput.clientId) {
        throw new ActionError(
          "Selecione o cliente que este usuário poderá ver no inventário."
        );
      }
      await ownedClient(ctx.organizationId, parsedInput.clientId);
      await setMemberClientScope(
        ctx.organizationId,
        target.id,
        parsedInput.clientId
      );
    } else {
      await setMemberClientScope(ctx.organizationId, target.id, null);
    }

    return { ok: true };
  });
