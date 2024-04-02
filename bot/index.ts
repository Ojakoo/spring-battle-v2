import "dotenv/config";

import { Context, Telegraf, Markup } from "telegraf";
import type { Update } from "telegraf/types";
import { callbackQuery, message } from "telegraf/filters";
import postgres from "postgres";
import { ZodError, z } from "zod";
// TODO: unpacking postgres with the current build results in export not provided
// for now resolved with using postgres.PostgreError
// related: https://github.com/porsager/postgres/issues/684
// import { PostgresError } from "postgres";

import db from "./src/db/db.js";
import { logs, users } from "./src/db/schema.js";
import { and, sql, eq, between, desc } from "drizzle-orm";

// types
type Guild = "SIK" | "KIK";

enum Sport {
  activity = "Activity",
  biking = "Biking",
  running_walking = "Running/Walking",
}

interface SportStatReturn {
  guild: Guild;
  distance: number;
  entries: number;
  sport: Sport;
}

interface PersonStatReturn {
  id: number;
  user_name: string;
  total_distance: number;
}

// connect to db
const sql_pg = postgres(
  process.env.POSTGRES_URL ||
    "postgresql://username:password@springbattlebot-db:5432/database"
);

// database access functions

async function getStats() {
  const stats = await db
    .select({
      guild: logs.guild,
      sport: logs.sport,
      sum: sql`sum(${logs.distance})`.mapWith(Number),
    })
    .from(logs)
    .groupBy(logs.guild, logs.sport);

  return Object.values(Sport).flatMap((sport) => {
    const kik = stats.find((s) => s.sport === sport && s.guild === "KIK") || {
      guild: "KIK",
      sport,
      sum: 0,
    };

    const sik = stats.find((s) => s.sport === sport && s.guild === "SIK") || {
      guild: "SIK",
      sport,
      sum: 0,
    };

    return { sport, sik_sum: sik.sum, kik_sum: kik.sum };
  });
}

async function getStatsByDate(start_date: Date, limit_date: Date) {
  const stats = await db
    .select({
      guild: logs.guild,
      sport: logs.sport,
      sum: sql`sum(${logs.distance})`.mapWith(Number),
    })
    .from(logs)
    .where(between(logs.createdAt, start_date, limit_date))
    .groupBy(logs.guild, logs.sport);

  return Object.values(Sport).flatMap((sport) => {
    const kik = stats.find((s) => s.sport === sport && s.guild === "KIK") || {
      guild: "KIK",
      sport,
      sum: 0,
    };

    const sik = stats.find((s) => s.sport === sport && s.guild === "SIK") || {
      guild: "SIK",
      sport,
      sum: 0,
    };

    return { sport, sik_sum: sik.sum, kik_sum: kik.sum };
  });
}

async function getUser(user_id: number) {
  const user =
    await sql_pg`SELECT user_name, guild FROM users WHERE id = ${user_id}`;

  return user;
}

async function getDistanceBySport() {
  return await sql_pg<SportStatReturn[]>`
      SELECT guild, sport, SUM(distance) AS distance, COUNT(distance)::int AS entries
        FROM logs 
        GROUP BY guild, sport
      `;
}

async function getMyStats(user_id: number) {
  const stats = await db
    .select({
      sport: logs.sport,
      sum: sql`sum(${logs.distance})`.mapWith(Number),
    })
    .from(logs)
    .where(eq(logs.userId, user_id))
    .groupBy(logs.sport);

  return Object.values(Sport).map((sport) => {
    const sik = stats.find((s) => s.sport === sport) || {
      sport,
      sum: 0,
    };

    return { sport, sum: sik.sum.toFixed(1) };
  });
}

async function getPersonalStatsByGuildAndDayRange(
  guild: Guild,
  start_date: Date,
  limit_date: Date,
  limit: number
) {
  const topX = await db
    .select({
      userName: users.userName,
      totalDistance: sql<number>`sum(${logs.distance})`,
    })
    .from(logs)
    .fullJoin(users, eq(logs.userId, users.id))
    .where(
      and(
        eq(logs.guild, guild),
        between(logs.createdAt, start_date, limit_date)
      )
    )
    .groupBy(users.userName, users.id)
    .orderBy(desc(sql<number>`sum(${logs.distance})`)) // TODO: can I get this from the select somehow?
    .limit(limit);

  return topX;
}

async function getPersonalStatsByGuild(guild: Guild) {
  const stats = await sql_pg<PersonStatReturn[]>`
    SELECT logs.user_id, users.user_name, SUM(distance) AS total_distance
    FROM logs JOIN users ON logs.user_id = users.id
    WHERE logs.guild = ${guild}
    GROUP BY logs.user_id, users.user_name
    ORDER BY total_distance DESC
    LIMIT 5
  `;

  return stats;
}

async function insertLog(user_id: number, sport: Sport, distance: number) {
  if (user_id !== null && sport !== null && distance !== null) {
    const user = await sql_pg`SELECT guild FROM users WHERE id = ${user_id}`;
    const log = await sql_pg`
      INSERT INTO logs
        (user_id, guild, sport, distance)
      VALUES
        (${user_id}, ${user[0].guild}, ${sport}, ${distance})
      RETURNING sport, distance
    `;
  }
}

async function getLogEvent(user_id: number) {
  const [log_event] =
    await sql_pg`SELECT * FROM log_events WHERE user_id = ${user_id}`;

  return log_event;
}

async function upsertLogEvent(user_id: number) {
  return await sql_pg`
    INSERT INTO log_events 
      (user_id) VALUES (${user_id})
    ON CONFLICT (user_id) DO UPDATE
      SET sport = NULL;
  `;
}

async function setLogEventSport(user_id: number, sport: Sport) {
  return await sql_pg`UPDATE log_events SET sport = ${sport} WHERE user_id = ${user_id} RETURNING user_id;`;
}

async function deleteLogEvent(user_id: number) {
  return await sql_pg`DELETE FROM log_events WHERE user_id = ${user_id}`;
}

async function insertUser(user_id: number, user_name: string, guild?: Guild) {
  return await sql_pg`
    INSERT INTO users
      (id, user_name, guild)
    VALUES
      (${user_id}, ${user_name}, ${guild || null})
    ON CONFLICT DO NOTHING;
  `;
}

async function setUserGuild(user_id: number, guild: Guild) {
  await sql_pg`UPDATE users SET guild = ${guild} WHERE id = ${user_id};`;
}

// bot logic

async function askSport(ctx: Context) {
  ctx.reply(
    "Please choose the sport:",
    Markup.inlineKeyboard([
      Markup.button.callback(
        Sport.running_walking,
        `sport ${Sport.running_walking}`
      ),
      Markup.button.callback(Sport.activity, `sport ${Sport.activity}`),
      Markup.button.callback(Sport.biking, `sport ${Sport.biking}`),
    ])
  );
}

async function handleDaily(ctx: Context, day_modifier: number = 0) {
  const today = new Date(new Date().toDateString());

  const start_date = new Date(
    new Date(new Date().setDate(today.getDate() + day_modifier)).toDateString()
  );
  const limit_date = new Date(
    new Date(
      new Date().setDate(today.getDate() + day_modifier + 1)
    ).toDateString()
  );

  let message = "Daily stats\n\n";

  const dailyStats = await getStatsByDate(start_date, limit_date);

  let kik_stats = "KIK:\n";
  let sik_stats = "SIK:\n";

  dailyStats.forEach((s) => {
    kik_stats += ` - ${s.sport}: ${s.kik_sum.toFixed(1)} km\n`;
    sik_stats += ` - ${s.sport}: ${s.sik_sum.toFixed(1)} km\n`;
  });

  message += kik_stats + "\n" + sik_stats;

  const kik_personals = await getPersonalStatsByGuildAndDayRange(
    "KIK",
    start_date,
    limit_date,
    10
  );

  const sik_personals = await getPersonalStatsByGuildAndDayRange(
    "SIK",
    start_date,
    limit_date,
    10
  );

  message += "\nKIK top 10\n";

  for (const [index, user] of kik_personals.entries()) {
    message += `  ${index + 1}. ${user.userName}: ${user.totalDistance.toFixed(
      1
    )} km\n`;
  }

  message += "\nSIK top 10\n";

  for (const [index, user] of sik_personals.entries()) {
    message += `  ${index + 1}. ${user.userName}: ${user.totalDistance.toFixed(
      1
    )} km\n`;
  }

  ctx.reply(message);
}

async function handleAll(ctx: Context) {
  const sports = await getDistanceBySport();

  let message = "";

  ["SIK", "KIK"].forEach((guild) =>
    Object.values(Sport).map((sport) => {
      const asd = sports.find((r) => r.sport === sport && r.guild === guild);

      message += `${guild} ${sport}: ${
        asd ? asd.distance.toFixed(1) : 0
      }km and ${asd ? asd.entries : 0} entries\n`;

      // TODO: janky conditional formatting
      if (sport === Sport.running_walking) {
        message += "\n";
      }
    })
  );

  const kik_personals = await getPersonalStatsByGuild("KIK");
  const sik_personals = await getPersonalStatsByGuild("SIK");

  kik_personals.forEach(
    (p, i) => (message += `${i + 1}. ${p.user_name}: ${p.total_distance} km\n`)
  );

  message += "\n";

  sik_personals.forEach(
    (p, i) => (message += `${i + 1}. ${p.user_name}: ${p.total_distance} km\n`)
  );

  ctx.reply(message);
}

if (process.env.BOT_TOKEN && process.env.ADMINS) {
  const admins = JSON.parse(process.env.ADMINS);
  const bot = new Telegraf(process.env.BOT_TOKEN);

  // start
  bot.start(async (ctx: Context) => {
    if (ctx.message && ctx.message.chat.type == "private") {
      const user_id = Number(ctx.message.from.id);
      const user = await getUser(user_id);

      const message_base =
        "Hello there, welcome to the KIK-SIK Spring Battle!\n\nTo record kilometers for your guild send me a picture of your achievement, this can be for example a screenshot of your daily steps or a Strava log showing the exercise amount and route. After this I'll ask a few questions recarding the exercise.\n\n You can check how many kilometers you have contributed with /personal. Additionally you can check the current status of the battle with /status, this command also works in the group chat! \n\nIf you have any questions about the battle you can ask in the main group and the organizers will answer you! If some technical problems appear with me, you can contact @Ojakoo.";

      if (user[0] && user[0].guild) {
        ctx.reply(
          message_base + `\n\nYou are competing with ${user[0].guild}.`
        );
      } else {
        const user_name = ctx.message.from.last_name
          ? `${ctx.message.from.first_name} ${ctx.message.from.last_name}`
          : ctx.message.from.first_name;

        await insertUser(user_id, user_name);

        ctx.reply(
          message_base +
            "\n\nTo register Choose guild you are going to represent, after this just send me a picture to log your kilometers!",
          Markup.inlineKeyboard([
            Markup.button.callback("SIK", "guild SIK"),
            Markup.button.callback("KIK", "guild KIK"),
          ])
        );
      }
    }
  });

  // admin commands
  bot.command("daily", async (ctx: Context) => {
    // TODO: add ability to choose the day range
    if (ctx.message && admins.list.includes(ctx.message.from.id)) {
      ctx.reply(
        "Please choose the day:",
        Markup.inlineKeyboard([
          Markup.button.callback("Today", "daily 0"),
          Markup.button.callback("Yesterday", "daily -1"),
        ])
      );
    }
  });

  bot.command("all", async (ctx: Context) => {
    if (ctx.message && admins.list.includes(ctx.message.from.id)) {
      await handleAll(ctx);
    }
  });

  // group commands
  bot.command("status", async (ctx: Context) => {
    const stats = await getStats();

    let sik_wins = 0;
    let kik_wins = 0;

    let message = "";

    let kik_stats = "KIK:\n";
    let sik_stats = "SIK:\n";

    stats.forEach((s) => {
      if (s.kik_sum > s.sik_sum) {
        kik_wins += 1;
      } else if (s.kik_sum < s.sik_sum) {
        sik_wins += 1;
      }

      kik_stats += ` - ${s.sport}: ${s.kik_sum.toFixed(1)} km${
        s.kik_sum > s.sik_sum ? " 🏆" : ""
      }\n`;
      sik_stats += ` - ${s.sport}: ${s.sik_sum.toFixed(1)} km${
        s.kik_sum < s.sik_sum ? " 🏆" : ""
      }\n`;
    });

    if (kik_wins < sik_wins) {
      message += `JAPPADAIDA! Sik has the lead by winning ${sik_wins} categories.\n\n`;
    } else if (kik_wins > sik_wins) {
      message = `Yy-Kaa-Kone! Kik has the lead by winning ${kik_wins} categories.\n\n`;
    } else {
      message += `It seems to be even with ${sik_wins} category wins for both guilds.\n\n`;
    }

    ctx.reply(message + kik_stats + "\n" + sik_stats);
  });

  // personal commands
  bot.command("personal", async (ctx: Context) => {
    if (ctx.message && ctx.message.chat.type == "private") {
      const user_id = Number(ctx.message.from.id);

      const my_stats = await getMyStats(user_id);

      let message = "Your personal stats are:\n\n";

      my_stats.forEach((s) => (message += `${s.sport}: ${s.sum}km\n`));

      ctx.reply(message);
    }
  });

  bot.command("cancel", (ctx: Context) => {
    if (ctx.has(message("text"))) {
      const user_id = Number(ctx.message.from.id);

      deleteLogEvent(user_id);

      ctx.reply("Succesfully stopped the logging event.");
    }
  });

  // text handler
  bot.on("text", async (ctx: Context) => {
    // check the data for active log and
    if (ctx.has(message("text"))) {
      const user_id = Number(ctx.message.from.id);

      const log_event = await getLogEvent(user_id);

      if (log_event && log_event.sport !== null) {
        try {
          const text = ctx.message.text;

          const distance = z.number().min(1).parse(Number(text));

          await insertLog(
            log_event.user_id,
            log_event.sport,
            log_event.sport === Sport.activity ? distance * 0.0007 : distance
          );

          await deleteLogEvent(log_event.user_id);

          ctx.reply("Thanks for participating!");
        } catch (e) {
          if (e instanceof postgres.PostgresError) {
            console.log(e);
            ctx.reply(
              "Encountered an error with logging data please contact @Ojakoo"
            );
          }

          if (e instanceof ZodError) {
            ctx.reply(
              log_event.sport === Sport.activity
                ? "Something went wrong with your input. Make sure you use whole numbers for steps. Please try again."
                : "Something went wrong with your input. Make sure you use . as separator for kilometers and meters, also the minimum distance is 1km. Please try again."
            );
          }
        }
      }
    }
  });

  bot.on("photo", async (ctx: Context) => {
    if (ctx.message && ctx.message.chat.type === "private") {
      const user_id = Number(ctx.message.from.id);
      const user = await getUser(user_id);

      if (user[0] && user[0].guild) {
        await upsertLogEvent(user_id);

        // TODO: upload photo somwhere and set reference,
        // alternatively can we fetch photos from some chat?

        askSport(ctx);
      } else {
        console.log(`User id: ${user_id}. User: ${user}`);
        ctx.reply("Please register with /start before recording kilometers.");
      }
    }
  });

  // callback handler
  bot.on("callback_query", async (ctx: Context<Update>) => {
    // answer callback
    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup(undefined);

    if (ctx.has(callbackQuery("data"))) {
      const user_id = Number(ctx.callbackQuery.from.id);

      var dataSplit = ctx.callbackQuery.data.split(" ");

      var logType = dataSplit[0];
      var logData = dataSplit[1];

      // stop logging if no active log found when user
      // uses /cancel and then answers the inlineKeyboard
      if (logType === "guild") {
        const user = await getUser(user_id);

        if (!user) {
          // Shouldnt be possible but we can just create user here also
          // TODO: should return to set start?
        }

        await setUserGuild(user_id, logData as Guild);

        ctx.reply(
          `Thanks! You chose ${logData} as your guild.\n\nTo start logging kilometers just send me a picture of your accomplishment!`
        );
      } else if (logType === "sport") {
        const log_event = await setLogEventSport(user_id, logData as Sport);

        if (log_event.length === 0) {
          ctx.reply("Something went wrong please try again.");

          return;
        }

        ctx.reply(
          logData === Sport.activity
            ? "Type the number of steps that you have walked. These are converted to kilometers automatically"
            : "Type the number of kilometers using '.' as a separator, for example: 5.5"
        );
      } else if (logType === "daily") {
        await handleDaily(ctx, Number(logData));
      }
    }
  });

  console.log("Starting bot");

  if (process.env.NODE_ENV === "production" && process.env.DOMAIN) {
    console.log("Running webhook");
    bot.launch({
      webhook: {
        domain: process.env.DOMAIN,
        port: 3000, // TODO: set port with env?
      },
    });
  } else {
    // TODO: bot timeouts sometimes with the getMe req, dosen't seem to be an issue with
    // webhooks, maybe netework related?
    console.log("Running in long poll mode");
    bot.launch();
  }

  // Enable graceful stop
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
} else {
  console.log("missing some environment variables...");
}
