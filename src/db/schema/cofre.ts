import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { organization } from "./auth";
import { client } from "./cadastros";
import { asset } from "./inventario";

const timestamps = {
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
};

export const vaultItem = pgTable(
  "vault_item",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clientId: text("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    assetId: text("asset_id").references(() => asset.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull().default("acesso"),
    title: text("title").notNull(),
    username: text("username"),
    secret: text("secret").notNull(),
    url: text("url"),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    index("vault_item_organizationId_idx").on(table.organizationId),
    index("vault_item_clientId_idx").on(table.clientId),
  ]
);
