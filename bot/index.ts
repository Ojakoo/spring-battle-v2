require("dotenv").config();
import { Context, Telegraf, Markup } from "telegraf";
import { Update } from "telegraf/typings/core/types/typegram";
import { callbackQuery } from "telegraf/filters";
const postgres = require("postgres");

// connect to db

const sql = postgres({});

async function getLogs() {
  console.log("getting logs");
  const users = await sql`
    SELECT * FROM logs
  `;
  return users;
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

type Guild = "SIK" | "KIK";
type Sport = "Running" | "Walking" | "Biking";

interface ActiveLog {
  user_id: Number;
  guild: Guild | null;
  sport: Sport | null;
  distance: Number | null;
}

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
  await ctx.reply("Insert kilometers in 1.1 format.");
}

if (process.env.BOT_TOKEN) {
  const bot = new Telegraf(process.env.BOT_TOKEN);

  bot.command("stats", async () => {
    const hmm = await getLogs();
    console.log("stats:");
    console.log(hmm);
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

  bot.on("text", async () => {
    // check the data for active log and
    console.log(activeLogs);
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
