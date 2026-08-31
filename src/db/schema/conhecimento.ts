import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { organization, user } from "./auth";
import { client } from "./cadastros";
import { ticket } from "./tickets";

const timestamps = {
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
};

export const kbArticle = pgTable(
  "kb_article",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clientId: text("client_id").references(() => client.id, {
      onDelete: "set null",
    }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    category: text("category").notNull().default("procedimento"),
    ...timestamps,
  },
  (table) => [
    index("kb_article_organizationId_idx").on(table.organizationId),
    index("kb_article_clientId_idx").on(table.clientId),
  ]
);

export const ticketKbArticle = pgTable(
  "ticket_kb_article",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => ticket.id, { onDelete: "cascade" }),
    articleId: text("article_id")
      .notNull()
      .references(() => kbArticle.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ticket_kb_article_uidx").on(table.ticketId, table.articleId),
    index("ticket_kb_article_ticketId_idx").on(table.ticketId),
    index("ticket_kb_article_organizationId_idx").on(table.organizationId),
  ]
);
