import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

console.log("Starting migrations");

const migrationClient = postgres(process.env.POSTGRES_URL, { max: 1 });
await migrate(drizzle(migrationClient), { migrationsFolder: "./drizzle" });

console.log("Migration successful");

process.exit();
