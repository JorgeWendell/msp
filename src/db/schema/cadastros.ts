import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth";

const timestamps = {
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
};

function orgId() {
  return text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });
}

export const client = pgTable(
  "client",
  {
    id: text("id").primaryKey(),
    organizationId: orgId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    tradeName: text("trade_name"),
    document: text("document"),
    email: text("email"),
    phone: text("phone"),
    zip: text("zip"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("client_code_uidx").on(table.code),
    index("client_organizationId_idx").on(table.organizationId),
  ]
);

export const clientContact = pgTable(
  "client_contact",
  {
    id: text("id").primaryKey(),
    organizationId: orgId(),
    clientId: text("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role"),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index("client_contact_organizationId_idx").on(table.organizationId),
    index("client_contact_clientId_idx").on(table.clientId),
  ]
);

export const operator = pgTable(
  "operator",
  {
    id: text("id").primaryKey(),
    organizationId: orgId(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    specialty: text("specialty").notNull().default("suporte"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => [index("operator_organizationId_idx").on(table.organizationId)]
);
