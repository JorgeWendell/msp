import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth";
import { client, clientContact, operator } from "./cadastros";

const timestamps = {
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
};

function orgId() {
  return text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });
}

export const ticket = pgTable(
  "ticket",
  {
    id: text("id").primaryKey(),
    organizationId: orgId(),
    number: text("number").notNull(),
    clientId: text("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    contactId: text("contact_id").references(() => clientContact.id, {
      onDelete: "set null",
    }),
    operatorId: text("operator_id").references(() => operator.id, {
      onDelete: "set null",
    }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category").notNull().default("incidente"),
    priority: text("priority").notNull().default("media"),
    status: text("status").notNull().default("aberto"),
    resolvedAt: timestamp("resolved_at"),
    closedAt: timestamp("closed_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("ticket_org_number_uidx").on(table.organizationId, table.number),
    index("ticket_organizationId_idx").on(table.organizationId),
    index("ticket_clientId_idx").on(table.clientId),
    index("ticket_status_idx").on(table.status),
  ]
);

export const ticketComment = pgTable(
  "ticket_comment",
  {
    id: text("id").primaryKey(),
    organizationId: orgId(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => ticket.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("ticket_comment_ticketId_idx").on(table.ticketId),
    index("ticket_comment_organizationId_idx").on(table.organizationId),
  ]
);

export const ticketEvent = pgTable(
  "ticket_event",
  {
    id: text("id").primaryKey(),
    organizationId: orgId(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => ticket.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("ticket_event_ticketId_idx").on(table.ticketId),
    index("ticket_event_organizationId_idx").on(table.organizationId),
  ]
);
