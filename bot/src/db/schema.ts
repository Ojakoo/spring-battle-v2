import {
  pgTable,
  pgEnum,
  bigint,
  text,
  serial,
  timestamp,
  real,
  index,
} from "drizzle-orm/pg-core";

export const guild = pgEnum("guild", ["SIK", "KIK"]);
export const sport = pgEnum("sport", ["Running/Walking", "Biking", "Activity"]);

export const users = pgTable("users", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  userName: text("user_name").notNull(),
  guild: guild("guild"),
});

export const logs = pgTable(
  "logs",
  {
    id: serial("id").primaryKey(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),
    guild: guild("guild").notNull(), // this is cached here just so i dont need to do any joins on status query
    sport: sport("sport").notNull(),
    distance: real("distance").notNull(),
  },
  (t) => {
    return {
      log_user_id_index: index("log_user_id_index").on(t.userId),
      log_guild_index: index("log_guild_index").on(t.guild),
    };
  }
);

export const log_events = pgTable("log_events", {
  user_id: bigint("user_id", { mode: "number" })
    .references(() => users.id, {
      onDelete: "cascade",
    })
    .primaryKey(),
  created_at: timestamp("created_at").notNull().defaultNow(),
  sport: sport("sport"),
});
