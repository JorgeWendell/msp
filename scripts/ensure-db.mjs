import { config } from "dotenv";
import pg from "pg";

config({ path: ".env" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL não definida no .env");
  process.exit(1);
}

const url = new URL(databaseUrl);
const dbName = url.pathname.replace(/^\//, "");
url.pathname = "/postgres";

const admin = new pg.Client({ connectionString: url.toString() });

await admin.connect();
const result = await admin.query(
  "SELECT 1 FROM pg_database WHERE datname = $1",
  [dbName]
);

if (!result.rowCount) {
  await admin.query(`CREATE DATABASE ${dbName}`);
  console.log(`created ${dbName}`);
} else {
  console.log(`${dbName} already exists`);
}

await admin.end();
