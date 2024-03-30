require("dotenv").config();

import { Context, Telegraf, Markup } from "telegraf";
import { Update } from "telegraf/typings/core/types/typegram";
import { callbackQuery, message } from "telegraf/filters";

const postgres = require("postgres");
import { PostgresError } from "postgres";

import { ZodError, z } from "zod";

// types
type Guild = "SIK" | "KIK";

enum Sport {
  activity = "Activity",
  biking = "Biking",
  running_walking = "Running/Walking",
}

interface GuildStatReturn {
  guild: Guild;
  sum: number;
  count: number;
}

interface SportStatReturn {
  guild: Guild;
  distance: number;
  entries: number;
  sport: Sport;
}

interface PersonStatReturn {
  user_id: number;
  user_name: string;
  total_distance: number;
}

// connect to db

const sql = postgres({});

// database access functions

async function getStats(): Promise<
  { guild: Guild; sport: Sport; sum: number }[]
> {
  return await sql`SELECT guild, sport, SUM(distance) FROM logs GROUP BY guild, sport`;
}

async function getUser(user_id: number) {
  const user =
    await sql`SELECT user_name, guild FROM users WHERE user_id = ${user_id}`;

  return user;
}

async function getDistanceBySport(): Promise<SportStatReturn[]> {
  return await sql`
      SELECT guild, sport, SUM(distance) AS distance, COUNT(distance)::int AS entries
        FROM logs 
        GROUP BY guild, sport
      `;
}

async function getMyStats(
  user_id: number
): Promise<{ sum: number; sport: Sport }[]> {
  const asd =
    await sql`SELECT SUM(distance) as sum, sport FROM logs WHERE user_id = ${user_id} GROUP BY sport`;

  return asd;
}

async function getPersonalStatsByGuildAndDayRange(
  guild: Guild,
  start_date: Date,
  limit_date: Date
) {
  const stats: PersonStatReturn[] = await sql`
    SELECT logs.user_id, users.user_name, SUM(distance) AS total_distance
    FROM logs JOIN users ON logs.user_id = users.user_id 
    WHERE logs.guild = ${guild} 
      AND logs.created_at >= ${start_date.toISOString()} 
      AND logs.created_at < ${limit_date.toISOString()} 
    GROUP BY logs.user_id, users.user_name
    ORDER BY total_distance DESC
    LIMIT 10
  `;

  return stats;
}

async function getPersonalStatsByGuild(guild: Guild) {
  const stats: PersonStatReturn[] = await sql`
    SELECT logs.user_id, users.user_name, SUM(distance) AS total_distance
    FROM logs JOIN users ON logs.user_id = users.user_id
    WHERE logs.guild = ${guild}
    GROUP BY logs.user_id, users.user_name
    ORDER BY total_distance DESC
    LIMIT 5
  `;

  return stats;
}

async function insertLog(user_id: number, sport: Sport, distance: number) {
  if (user_id !== null && sport !== null && distance !== null) {
    const user = await sql`SELECT guild FROM users WHERE user_id = ${user_id}`;
    const log = await sql`
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
    await sql`SELECT * FROM log_events WHERE user_id = ${user_id}`;

  return log_event;
}

async function upsertLogEvent(user_id: number) {
  return await sql`
    INSERT INTO log_events 
      (user_id) VALUES (${user_id}) 
    ON CONFLICT (user_id) DO UPDATE
      SET sport = NULL;
  `;
}

async function setLogEventSport(user_id: number, sport: Sport) {
  return await sql`UPDATE log_events SET sport = ${sport} WHERE user_id = ${user_id} RETURNING user_id;`;
}

async function deleteLogEvent(user_id: number) {
  return await sql`DELETE FROM log_events WHERE user_id = ${user_id}`;
}

async function insertUser(user_id: number, user_name: string, guild?: Guild) {
  return await sql`
    INSERT INTO users
      (user_id, user_name, guild)
    VALUES
      (${user_id}, ${user_name}, ${guild || null})
    ON CONFLICT DO NOTHING;
  `;
}

async function setUserGuild(user_id: number, guild: Guild) {
  await sql`UPDATE users SET guild = ${guild} WHERE user_id = ${user_id};`;
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

  // Db stores data in gmt 0, transform local finnish time to match
  // TODO: make dynamic this just adjusts based the db time to finnish time on fixed value
  const start_date_GMT = new Date(start_date.setHours(start_date.getHours()));
  const limit_date_GMT = new Date(limit_date.setHours(limit_date.getHours()));

  const kik_personals = await getPersonalStatsByGuildAndDayRange(
    "KIK",
    start_date_GMT,
    limit_date_GMT
  );

  const sik_personals = await getPersonalStatsByGuildAndDayRange(
    "SIK",
    start_date_GMT,
    limit_date_GMT
  );

  ctx.reply("asd");
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

    let message = "asd";

    let win_count_sik = 0;
    let win_count_kik = 0;

    Object.values(Sport).forEach((sport) => {
      const kik = stats.find((s) => s.sport === sport && s.guild === "KIK");
      const sik = stats.find((s) => s.sport === sport && s.guild === "SIK");
    });

    // let statusText = `It seems to be even with ${fixed_kik}km for both guilds.`;

    // if (kik_total < sik_total) {
    //   statusText = `JAPPADAIDA!1!\n\nSik has the lead with ${fixed_sik}km. Kik has some catching up to do with ${fixed_kik}km.`;
    // } else if (kik_total > sik_total) {
    //   statusText = `Yy-Kaa-Kone!\n\nKik has the lead with ${fixed_kik}km. Sik has some cathing up to do with ${fixed_sik}km.`;
    // }

    ctx.reply(message);
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
          if (e instanceof PostgresError) {
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

  // TODO: autocreate webhooks for prod
  console.log("Starting bot");

  bot.launch();

  // Enable graceful stop
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
} else {
  console.log("missing some environment variables...");
}
