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
  user_id: Number;
  guild: Guild | null;
  sport: Sport | null;
  distance: Number | null;
}

interface StatReturn {
  guild: Guild;
  sum: number;
}

// connect to db

const sql = postgres({});

async function getLogs() {
  const users = await sql`
    SELECT * FROM logs
  `;
  return users;
}

async function getStats() {
  const tot = await (<StatReturn[]>(
    sql`SELECT guild, SUM(distance) FROM logs GROUP BY guild`
  ));

  return {
    kik_total: tot.filter((item) => item.guild === "KIK")[0]?.sum,
    sik_total: tot.filter((item) => item.guild === "SIK")[0]?.sum,
  };
}

async function insertLog({ user_id, guild, sport, distance }: ActiveLog) {
  const users = await sql`
    INSERT INTO logs
      (user_id, guild, sport, distance)
    VALUES
      (${user_id}, ${guild}, ${sport}, ${distance})
    RETURNING sport, distance
  `;
  return users;
}

// bot logic

let activeLogs: Array<ActiveLog> = [];

async function askSport(ctx: Context) {
  ctx.reply(
    "Choose sport",
    Markup.inlineKeyboard([
      Markup.button.callback("Running", "sport Running"),
      Markup.button.callback("Walking", "sport Walking"),
      Markup.button.callback("Biking", "sport Biking"),
    ])
  );
}

async function askGuild(ctx: Context) {
  ctx.reply(
    "Choose guild",
    Markup.inlineKeyboard([
      Markup.button.callback("SIK", "guild SIK"),
      Markup.button.callback("KIK", "guild KIK"),
    ])
  );
}

async function askDistance(ctx: Context) {
  // TODO: create db entry
  ctx.reply("Insert kilometers in 1.1 format.");
}

if (process.env.BOT_TOKEN) {
  const bot = new Telegraf(process.env.BOT_TOKEN);

  bot.command("stats", async (ctx: Context) => {
    const { kik_total, sik_total } = await getStats();
    const fixed_kik = kik_total.toFixed(1);
    const fixed_sik = sik_total.toFixed(1);

    console.log({ kik_total, sik_total });

    let statusText = `It seems to be even with ${fixed_kik}km for both guilds.`;

    if (kik_total < sik_total) {
      statusText = `JAPPADAIDA!1!\n\nSik has the lead with ${fixed_sik}km. Kik has some catching up to do with ${fixed_kik}km.`;
    } else if (kik_total > sik_total) {
      statusText = `Yy-Kaa-Kone!\n\nKik has the lead with ${fixed_kik}km. Sik has some cathing up to do with ${fixed_sik}km.`;
    }

    ctx.reply(statusText);
  });

  bot.command("log", (ctx: Context) => {
    if (ctx.message) {
      const user_id = Number(ctx.message.from.id);

      if (activeLogs.some((item) => item.user_id === user_id)) {
        var index = activeLogs.findIndex((item) => item.user_id === user_id);
        activeLogs.splice(index, 1);
      }

      activeLogs.push({
        user_id: user_id,
        guild: null,
        sport: null,
        distance: null,
      });

      askGuild(ctx);
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
        console.log(activeLogs);
      }
    }
  });

  bot.on("text", async (ctx: Context) => {
    // check the data for active log and

    if (ctx.has(message("text"))) {
      const user_id = Number(ctx.message.from.id);
      var activeLogIndex = activeLogs.findIndex(
        (log) => log.user_id === user_id
      );

      if (activeLogIndex != -1) {
        try {
          const text = ctx.message.text;
          console.log(activeLogs);

          activeLogs[activeLogIndex].distance = z.number().parse(Number(text));
          await insertLog(activeLogs[activeLogIndex]);
          activeLogs.splice(activeLogIndex);

          console.log(activeLogs);

          ctx.reply("Thanks!");
        } catch (e) {
          console.log(e);

          if (e instanceof PostgresError) {
            ctx.reply("Please select a option to continue");
          }

          if (e instanceof ZodError) {
            ctx.reply(
              "Something went wrong with your input. Make sure you use . as separator for kilometers and meters, please try again."
            );
          }
        }
      }
    }
  });

  bot.on("callback_query", async (ctx: Context<Update>) => {
    // answer callback
    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup(undefined);

    if (ctx.has(callbackQuery("data"))) {
      const user_id = Number(ctx.callbackQuery.from.id);
      var activeLogIndex = activeLogs.findIndex(
        (log) => log.user_id === user_id
      );

      // stop logging if no active log found when user
      // uses /cancel and then answers the inlineKeyboard
      if (activeLogIndex == -1) {
        return;
      }

      var dataSplit = ctx.callbackQuery.data.split(" ");

      var logType = dataSplit[0];
      var logData = dataSplit[1];

      // check what to do with cb data
      if (logType === "sport") {
        // TODO: add error handling
        activeLogs[activeLogIndex].sport = logData as Sport;

        askDistance(ctx);
      } else if (logType === "guild") {
        // TODO: add error handling
        activeLogs[activeLogIndex].guild = logData as Guild;

        askSport(ctx);
      }
    }
  });

  bot.launch();

  console.log("running bot");

  // Enable graceful stop
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
