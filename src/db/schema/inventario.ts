import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";
import { client } from "./cadastros";

const timestamps = {
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
};

export const asset = pgTable(
  "asset",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clientId: text("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    hostname: text("hostname").notNull(),
    serial: text("serial"),
    kind: text("kind").notNull().default("desktop"),
    os: text("os"),
    ip: text("ip"),
    mac: text("mac"),
    location: text("location"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    agentStatus: text("agent_status").notNull().default("desconhecido"),
    agentToken: text("agent_token").notNull(),
    agentVersion: text("agent_version"),
    meshNodeId: text("mesh_node_id"),
    lastSeenAt: timestamp("last_seen_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("asset_agent_token_uidx").on(table.agentToken),
    uniqueIndex("asset_mesh_node_id_uidx").on(table.meshNodeId),
    index("asset_organizationId_idx").on(table.organizationId),
    index("asset_clientId_idx").on(table.clientId),
  ]
);

export const assetInventory = pgTable(
  "asset_inventory",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    assetId: text("asset_id")
      .notNull()
      .references(() => asset.id, { onDelete: "cascade" }),
    payload: jsonb("payload").notNull(),
    collectedAt: timestamp("collected_at").notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("asset_inventory_assetId_uidx").on(table.assetId),
    index("asset_inventory_organizationId_idx").on(table.organizationId),
  ]
);
