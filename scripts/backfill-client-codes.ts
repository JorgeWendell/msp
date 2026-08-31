import { config } from "dotenv";
import { or, eq, isNull } from "drizzle-orm";

config({ path: ".env" });

async function uniqueCode(
  db: typeof import("../src/db").db,
  clientTable: typeof import("../src/db/schema").client
) {
  const { createClientCode } = await import("../src/lib/client-code");
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const code = createClientCode();
    const [existing] = await db
      .select({ id: clientTable.id })
      .from(clientTable)
      .where(eq(clientTable.code, code))
      .limit(1);
    if (!existing) return code;
  }
  throw new Error("Não foi possível gerar código único.");
}

async function main() {
  const { db } = await import("../src/db");
  const { client } = await import("../src/db/schema");

  const rows = await db
    .select({ id: client.id, code: client.code })
    .from(client)
    .where(or(isNull(client.code), eq(client.code, "")));

  for (const row of rows) {
    const code = await uniqueCode(db, client);
    await db.update(client).set({ code }).where(eq(client.id, row.id));
    console.log(row.id, code);
  }

  console.log(`Atualizados: ${rows.length}`);
  process.exit(0);
}

void main();
