import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export const sql = postgres(process.env.POSTGRES_URL);

const db = drizzle(sql);

export default db;
