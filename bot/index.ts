require("dotenv").config();

import { Context, Telegraf, Markup } from "telegraf";
import { Update } from "telegraf/typings/core/types/typegram";
import { callbackQuery, message } from "telegraf/filters";

const postgres = require("postgres");
import { PostgresError } from "postgres";

import { ZodError, z } from "zod";

// types

type Guild = "SIK" | "KIK";
type Sport = "Running" | "Walking" | "Biking";

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

async function getStatsByDayRange(start_date: Date, limit_date: Date) {
  // query: created_at >= WANTED_DATE and created_at < NEXT_DATE
  const tot: GuildStatReturn[] =
    await sql`SELECT guild, SUM(distance), COUNT(distance) FROM logs WHERE created_at >= ${start_date.toISOString()} AND created_at < ${limit_date.toISOString()} GROUP BY guild`;

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

async function insertLog({ user_id, sport, distance }: ActiveLog) {
  const user = await sql`SELECT guild FROM users WHERE user_id = ${user_id}`;

  // TODO: throw error if no user

  if (sport === null || distance === null || user_id === null) {
    return;
  }

  const log = await sql`
    INSERT INTO logs
      (user_id, guild, sport, distance)
    VALUES
      (${user_id}, ${user[0].guild}, ${sport}, ${
    sport === "Biking" ? distance * 0.5 : distance
  })
    RETURNING sport, distance
  `;
  return;
}

async function insertUser({ user_id, user_name, guild }: ActiveStart) {
  const user = await sql`
    INSERT INTO users
      (user_id, user_name, guild)
    VALUES
      (${user_id}, ${user_name}, ${guild})
    RETURNING user_name, guild
  `;

  console.log(`added user: ${user_name}`);
  return user;
}

// bot logic

let activeLogs: Array<ActiveLog> = [];
let activeStarts: Array<ActiveStart> = [];

async function askSport(ctx: Context) {
  ctx.reply(
    "Please choose the sport:",
    Markup.inlineKeyboard([
      Markup.button.callback("Running", "sport Running"),
      Markup.button.callback("Walking", "sport Walking"),
      Markup.button.callback("Biking", "sport Biking"),
    ])
  );
}

async function askGuild(ctx: Context) {
  ctx.reply(
    "Hello there, welcome to the KIK-SIK Spring Battle!\n\nTo record kilometers for your guild send me a picture with some proof, showing atleast the exercise amount and route. This can be for example a screenshot of the Strava log. After this I'll ask a few questions recarding the exercise.\n\nIf you want to check the current status of the battle you can do so with /status, this command also works in the group chat! You can also check how many kilometers you have contributed with /personal.\n\nFor questions about the battle contact @x or @y. If there are some technical problems with me, you can contact @Ojakoo.\n\nTo start logging Choose guild you are going to represent:",
    Markup.inlineKeyboard([
      Markup.button.callback("SIK", "guild SIK"),
      Markup.button.callback("KIK", "guild KIK"),
    ])
  );
}

if (process.env.BOT_TOKEN && process.env.ADMINS) {
  const admins = JSON.parse(process.env.ADMINS);
  const bot = new Telegraf(process.env.BOT_TOKEN);

  // admin commands
  bot.command("daily", async (ctx: Context) => {
    if (ctx.message && admins.list.includes(ctx.message.from.id)) {
      const start_date = new Date(new Date().toDateString());
      const limit_date = new Date(new Date().setDate(start_date.getDate() + 1));

      const { kik_range_total, kik_count, sik_range_total, sik_count } =
        await getStatsByDayRange(start_date, limit_date);

      const kik_personals = await getPersonalStatsByGuildAndDayRange(
        "KIK",
        start_date,
        limit_date
      );
      const sik_personals = await getPersonalStatsByGuildAndDayRange(
        "SIK",
        start_date,
        limit_date
      );

      const sorted_kik = kik_personals.sort((a, b) => {
        return b.sum - a.sum;
      });
      const sorted_sik = sik_personals.sort((a, b) => {
        return b.sum - a.sum;
      });

      let message = `The stats for the day ${start_date} are:\n\nKIK total: ${kik_range_total.toFixed(
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
  bot.command("start", async (ctx: Context) => {
    if (ctx.message && ctx.message.chat.type == "private") {
      // TODO: check db for user, if exists answer with only the available command

      const user_id = Number(ctx.message.from.id);
      const user_name = ctx.message.from.last_name
        ? `${ctx.message.from.first_name} ${ctx.message.from.last_name}`
        : ctx.message.from.first_name;

      if (activeStarts.some((item) => item.user_id === user_id)) {
        var index = activeStarts.findIndex((item) => item.user_id === user_id);
        activeStarts.splice(index, 1);
      }

      activeStarts.push({
        user_id: user_id,
        user_name: user_name,
        guild: null,
      });

      askGuild(ctx);
    }
  });

  bot.command("personal", async (ctx: Context) => {
    if (ctx.message && ctx.message.chat.type == "private") {
      const user_id = Number(ctx.message.from.id);

      const my_stats = await getMyStats(user_id);

      ctx.reply(`Your total contribution is ${my_stats.sum}km`);
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

          activeLogs[activeLogIndex].distance = z
            .number()
            .nonnegative()
            .parse(Number(text));
          await insertLog(activeLogs[activeLogIndex]);
          activeLogs.splice(activeLogIndex);

          ctx.reply("Thanks for participating!");
        } catch (e) {
          console.log(e);

          if (e instanceof PostgresError) {
            ctx.reply("Please select a option to continue");
          }

          if (e instanceof ZodError) {
            ctx.reply(
              "Something went wrong with your input. Make sure you use . as separator for kilometers and meters, also use positive numbers. Please try again."
            );
          }
        }
      }
    }
  });

  bot.on("photo", async (ctx: Context) => {
    if (ctx.message && ctx.message.chat.type === "private") {
      const user_id = Number(ctx.message.from.id);

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

      // stop logging if no active log found when user
      // uses /cancel and then answers the inlineKeyboard
      if (activeStartsIndex != -1) {
        var dataSplit = ctx.callbackQuery.data.split(" ");

        var logType = dataSplit[0];
        var logData = dataSplit[1];

        if (logType === "guild") {
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
        }
      } else if (activeLogIndex != -1) {
        var dataSplit = ctx.callbackQuery.data.split(" ");

        var logType = dataSplit[0];
        var logData = dataSplit[1];

        // check what to do with cb data
        if (logType === "sport") {
          // TODO: add error handling
          activeLogs[activeLogIndex].sport = logData as Sport;

          ctx.reply(
            "Type the number of kilometers using '.' as a separator, for example: 5.5"
          );
        }
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
