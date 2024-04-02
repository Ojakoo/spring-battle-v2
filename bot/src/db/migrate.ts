import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

console.log("Starting migrations");

const migrationClient = postgres(
  process.env.POSTGRES_URL ||
    "postgresql://username:password@springbattlebot-db:5432/database",
  { max: 1 }
);
await migrate(drizzle(migrationClient), { migrationsFolder: "./drizzle" });

migrationClient.end();

console.log("Migration successful");

process.exit();
