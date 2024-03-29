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
  running_walking = "Running/Walking",
  activity = "Activity",
  biking = "Biking",
}

interface ActiveLog {
  user_id: number;
  sport: Sport | null;
  distance: number | null;
}

interface ActiveStart {
  user_id: number;
  user_name: string;
  guild: Guild | null;
}

interface GuildStatReturn {
  guild: Guild;
  sum: number;
  count: number;
}

interface SportStatReturn {
  guild: Guild;
  sum: number;
  count: number;
  sport: Sport;
}

interface PersonStatReturn {
  user_id: number;
  user_name: string;
  sum: number;
}

// connect to db

const sql = postgres({});

// database access functions

async function getStats() {
  const tot: GuildStatReturn[] =
    await sql`SELECT guild, SUM(distance) FROM logs GROUP BY guild`;
  const kik = tot.filter((item) => item.guild === "KIK")[0];
  const sik = tot.filter((item) => item.guild === "SIK")[0];

  return {
    kik_total: kik ? kik.sum : 0,
    sik_total: sik ? sik.sum : 0,
  };
}

async function getUser(user_id: number) {
  const user =
    await sql`SELECT user_name, guild FROM users WHERE user_id = ${user_id}`;

  return user;
}

async function getDistanceBySport() {
  const sportData: SportStatReturn[] =
    await sql`SELECT guild, sport, SUM(distance), COUNT(distance)::int FROM logs GROUP BY guild, sport`;

  const sik_activity = sportData.filter(
    (item) => item.guild === "SIK" && item.sport === Sport.activity
  )[0];
  const sik_running = sportData.filter(
    (item) => item.guild === "SIK" && item.sport === Sport.running_walking
  )[0];
  const sik_biking = sportData.filter(
    (item) => item.guild === "SIK" && item.sport === Sport.biking
  )[0];

  const kik_activity = sportData.filter(
    (item) => item.guild === "KIK" && item.sport === Sport.activity
  )[0];
  const kik_running = sportData.filter(
    (item) => item.guild === "KIK" && item.sport === Sport.running_walking
  )[0];
  const kik_biking = sportData.filter(
    (item) => item.guild === "KIK" && item.sport === Sport.biking
  )[0];

  return {
    sik_biking: sik_biking
      ? sik_biking
      : { guild: "SIK", sport: Sport.biking, sum: 0, count: 0 },
    sik_running: sik_running
      ? sik_running
      : { guild: "SIK", sport: Sport.running_walking, sum: 0, count: 0 },
    sik_activity: sik_activity
      ? sik_activity
      : { guild: "SIK", sport: Sport.activity, sum: 0, count: 0 },
    kik_biking: kik_biking
      ? kik_biking
      : { guild: "KIK", sport: Sport.biking, sum: 0, count: 0 },
    kik_running: kik_running
      ? kik_running
      : { guild: "KIK", sport: Sport.running_walking, sum: 0, count: 0 },
    kik_activity: kik_activity
      ? kik_activity
      : { guild: "KIK", sport: Sport.activity, sum: 0, count: 0 },
  };
}

async function getStatsByDayRange(start_date: Date, limit_date: Date) {
  // query: created_at >= WANTED_DATE and created_at < NEXT_DATE
  const tot: GuildStatReturn[] =
    await sql`SELECT guild, SUM(distance), COUNT(distance)::int 
      FROM logs 
      WHERE created_at >= ${start_date.toISOString()} 
        AND created_at < ${limit_date.toISOString()} 
      GROUP BY guild`;

  const kik = tot.filter((item) => item.guild === "KIK")[0];
  const sik = tot.filter((item) => item.guild === "SIK")[0];

  return {
    kik_range_total: kik ? kik.sum : 0,
    kik_count: kik ? kik.count : 0,
    sik_range_total: sik ? sik.sum : 0,
    sik_count: sik ? sik.count : 0,
  };
}

async function getMyStats(user_id: number) {
  const my_stats: PersonStatReturn[] =
    await sql`SELECT user_id, SUM(distance) FROM logs WHERE user_id = ${user_id} GROUP BY user_id`;

  return { sum: my_stats[0] ? my_stats[0].sum : 0 };
}

async function getPersonalStatsByGuildAndDayRange(
  guild: Guild,
  start_date: Date,
  limit_date: Date
) {
  const stats: PersonStatReturn[] = await sql`
    SELECT logs.user_id, users.user_name, SUM(distance) 
    FROM logs JOIN users ON logs.user_id = users.user_id 
    WHERE logs.guild = ${guild} 
      AND logs.created_at >= ${start_date.toISOString()} 
      AND logs.created_at < ${limit_date.toISOString()} 
    GROUP BY logs.user_id, users.user_name`;

  return stats;
}

async function getPersonalStatsByGuild(guild: Guild) {
  const stats: PersonStatReturn[] = await sql`
    SELECT logs.user_id, users.user_name, SUM(distance)
    FROM logs JOIN users ON logs.user_id = users.user_id
    WHERE logs.guild = ${guild}
    GROUP BY logs.user_id, users.user_name`;

  return stats;
}

async function insertLog({ user_id, sport, distance }: ActiveLog) {
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

async function insertUser({ user_id, user_name, guild }: ActiveStart) {
  const user = await sql`
    INSERT INTO users
      (user_id, user_name, guild)
    VALUES
      (${user_id}, ${user_name}, ${guild})
    RETURNING user_name, guild
  `;

  return user;
}

// bot logic

let activeLogs: Array<ActiveLog> = [];
let activeStarts: Array<ActiveStart> = [];

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
  const start_date_GMT = new Date(
    start_date.setHours(start_date.getHours() - 3)
  );
  const limit_date_GMT = new Date(
    limit_date.setHours(limit_date.getHours() - 3)
  );

  const { kik_range_total, kik_count, sik_range_total, sik_count } =
    await getStatsByDayRange(start_date_GMT, limit_date_GMT);

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

  const sorted_kik = kik_personals.sort((a, b) => {
    return b.sum - a.sum;
  });
  const sorted_sik = sik_personals.sort((a, b) => {
    return b.sum - a.sum;
  });

  // use limit here as we moved limit and start -3
  let message = `The stats for the day ${limit_date.toDateString()} are:\n\nKIK total: ${kik_range_total.toFixed(
    1
  )}km with ${kik_count} entries.\n\nKIK top five:\n`;

  for (let i = 0; i < 5; i++) {
    message += sorted_kik[i]
      ? `${i + 1}: ${sorted_kik[i].user_name} ${sorted_kik[i].sum.toFixed(
          1
        )}km\n`
      : "";
  }

  message += `\nSIK total: ${sik_range_total.toFixed(
    1
  )}km with ${sik_count} entries.\n\nSIK top five:\n`;

  for (let i = 0; i < 5; i++) {
    message += sorted_sik[i]
      ? `${i + 1}: ${sorted_sik[i].user_name} ${sorted_sik[i].sum.toFixed(
          1
        )}km\n`
      : "";
  }

  ctx.reply(message);
}

async function handleAll(ctx: Context) {
  const {
    sik_biking,
    sik_running,
    sik_activity,
    kik_biking,
    kik_running,
    kik_activity,
  } = await getDistanceBySport();

  const sik_range_total = sik_biking.sum + sik_running.sum + sik_activity.sum;
  const sik_count = sik_biking.count + sik_running.count + sik_activity.count;

  const kik_range_total = kik_biking.sum + kik_running.sum + kik_activity.sum;
  const kik_count = kik_biking.count + kik_running.count + kik_activity.count;

  const kik_personals = await getPersonalStatsByGuild("KIK");
  const sik_personals = await getPersonalStatsByGuild("SIK");

  const sorted_kik = kik_personals.sort((a, b) => {
    return b.sum - a.sum;
  });
  const sorted_sik = sik_personals.sort((a, b) => {
    return b.sum - a.sum;
  });

  let message = `\nKIK total: ${kik_range_total.toFixed(
    1
  )}km with ${kik_count} entries.\nKIK Biking: ${kik_biking.sum.toFixed(
    1
  )}km with ${
    kik_biking.count
  } entries.\nKIK Running / Walking: ${kik_running.sum.toFixed(1)}km with ${
    kik_running.count
  } entries.\nKIK Activity: ${kik_activity.sum.toFixed(1)}km with ${
    kik_activity.count
  } entries.\n\nKIK top ten:\n`;

  for (let i = 0; i < 10; i++) {
    message += sorted_kik[i]
      ? `${i + 1}: ${sorted_kik[i].user_name} ${sorted_kik[i].sum.toFixed(
          1
        )}km\n`
      : "";
  }

  message += `\nSIK total: ${sik_range_total.toFixed(
    1
  )}km with ${sik_count} entries.\nSIK Biking: ${sik_biking.sum.toFixed(
    1
  )}km with ${
    sik_biking.count
  } entries.\nSIK Running / Walking: ${sik_running.sum.toFixed(1)}km with ${
    sik_running.count
  } entries.\nSIK Activity: ${sik_activity.sum.toFixed(1)}km with ${
    sik_activity.count
  } entries.\n\nSIK top ten:\n`;

  for (let i = 0; i < 10; i++) {
    message += sorted_sik[i]
      ? `${i + 1}: ${sorted_sik[i].user_name} ${sorted_sik[i].sum.toFixed(
          1
        )}km\n`
      : "";
  }

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
        "Hello there, welcome to the KIK-SIK Spring Battle!\n\nTo record kilometers for your guild send me a picture with some proof, showing atleast the exercise amount and route. This can be for example a screenshot of the Strava log. After this I'll ask a few questions recarding the exercise.\n\nIf you want to check the current status of the battle you can do so with /status, this command also works in the group chat! You can also check how many kilometers you have contributed with /personal.\n\nIf you have any questions about the battle you can ask in the main group and the organizers will help you! If some technical problems appear with me, you can contact @Ojakoo.";

      if (user[0]) {
        ctx.reply(message_base + `You are competing with ${user[0].guild}.`);
      } else {
        const user_name = ctx.message.from.last_name
          ? `${ctx.message.from.first_name} ${ctx.message.from.last_name}`
          : ctx.message.from.first_name;

        if (activeStarts.some((item) => item.user_id === user_id)) {
          var index = activeStarts.findIndex(
            (item) => item.user_id === user_id
          );
          activeStarts.splice(index, 1);
        }

        activeStarts.push({
          user_id: user_id,
          user_name: user_name,
          guild: null,
        });

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
    console.log(ctx.message?.from.id);
    console.log("list", admins.list);
    console.log(admins.list.includes(ctx.message?.from.id));

    if (ctx.message && admins.list.includes(ctx.message.from.id)) {
      await handleAll(ctx);
    }
  });

  // group commands
  bot.command("status", async (ctx: Context) => {
    const { kik_total, sik_total } = await getStats();
    const fixed_kik = kik_total.toFixed(1);
    const fixed_sik = sik_total.toFixed(1);

    let statusText = `It seems to be even with ${fixed_kik}km for both guilds.`;

    if (kik_total < sik_total) {
      statusText = `JAPPADAIDA!1!\n\nSik has the lead with ${fixed_sik}km. Kik has some catching up to do with ${fixed_kik}km.`;
    } else if (kik_total > sik_total) {
      statusText = `Yy-Kaa-Kone!\n\nKik has the lead with ${fixed_kik}km. Sik has some cathing up to do with ${fixed_sik}km.`;
    }

    ctx.reply(statusText);
  });

  // personal commands
  bot.command("personal", async (ctx: Context) => {
    if (ctx.message && ctx.message.chat.type == "private") {
      const user_id = Number(ctx.message.from.id);

      const my_stats = await getMyStats(user_id);

      ctx.reply(`Your total contribution is ${my_stats.sum.toFixed(1)}km`);
    }
  });

  bot.command("cancel", (ctx: Context) => {
    if (ctx.has(message("text"))) {
      const user_id = Number(ctx.message.from.id);
      var activeLogIndex = activeLogs.findIndex(
        (log) => log.user_id === user_id
      );

      if (activeLogIndex != -1) {
        activeLogs.splice(activeLogIndex);
      }

      ctx.reply("Succesfully stopped the logging event.");
    }
  });

  // text handler
  bot.on("text", async (ctx: Context) => {
    // check the data for active log and
    if (ctx.has(message("text"))) {
      const user_id = Number(ctx.message.from.id);
      var activeLogIndex = activeLogs.findIndex(
        (log) => log.user_id === user_id
      );

      if (activeLogIndex !== -1 && activeLogs[activeLogIndex].sport !== null) {
        try {
          const text = ctx.message.text;

          const distance = z.number().min(1).parse(Number(text));

          // set distance for activity input is steps so convert to kms
          activeLogs[activeLogIndex].distance =
            activeLogs[activeLogIndex].sport === Sport.activity
              ? distance * 0.0007
              : distance;

          await insertLog(activeLogs[activeLogIndex]);
          activeLogs.splice(activeLogIndex);

          ctx.reply("Thanks for participating!");
        } catch (e) {
          console.log(e);

          if (e instanceof PostgresError) {
            ctx.reply(
              "Encountered an error with logging data please contact @Ojakoo"
            );
          }

          if (e instanceof ZodError) {
            ctx.reply(
              activeLogs[activeLogIndex].sport === Sport.activity
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

      if (user[0]) {
        if (activeLogs.some((item) => item.user_id === user_id)) {
          var index = activeLogs.findIndex((item) => item.user_id === user_id);
          activeLogs.splice(index, 1);
        }

        activeLogs.push({
          user_id: user_id,
          sport: null,
          distance: null,
        });

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
      var activeLogIndex = activeLogs.findIndex(
        (log) => log.user_id === user_id
      );

      var activeStartsIndex = activeStarts.findIndex(
        (log) => log.user_id === user_id
      );

      var dataSplit = ctx.callbackQuery.data.split(" ");

      var logType = dataSplit[0];
      var logData = dataSplit[1];

      // stop logging if no active log found when user
      // uses /cancel and then answers the inlineKeyboard
      if (activeStartsIndex != -1 && logType === "guild") {
        try {
          activeStarts[activeStartsIndex].guild = logData as Guild;
          await insertUser(activeStarts[activeStartsIndex]);
          activeStarts.splice(activeStartsIndex);

          ctx.reply(
            `Thanks! You chose ${logData} as your guild.\n\nTo start logging kilometers just send me a picture of your accomplishment!`
          );
        } catch (e) {
          console.log(e);
        }
      } else if (activeLogIndex != -1 && logType === "sport") {
        // TODO: add error handling
        activeLogs[activeLogIndex].sport = logData as Sport;

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

  bot.launch();

  console.log("running bot");

  // Enable graceful stop
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
} else {
  console.log("missing some environment variables...");
}
