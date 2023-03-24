require("dotenv").config();
const { Telegraf } = require("telegraf");
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

async function insertLog({ user_id, guild, sport, distance }) {
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

let activeLogs = [];

async function askSport(ctx) {
  ctx.reply({
    text: "Choose sport",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Running",
            callback_data: `sport Running`,
          },
        ],
        [
          {
            text: "Walking",
            callback_data: `sport Walking`,
          },
        ],
        [
          {
            text: "Biking",
            callback_data: `sport Biking`,
          },
        ],
      ],
    },
  });
}

async function askGuild(ctx) {
  ctx.reply({
    text: "Choose guild",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "SIK",
            callback_data: "guild SIK",
          },
        ],
        [
          {
            text: "KIK",
            callback_data: "guild KIK",
          },
        ],
      ],
    },
  });
}

async function askDistance(ctx) {
  // TODO: create db entry
  await ctx.reply({
    text: "Insert kilometers in 1.1 format.",
    reply_markup: {
      force_reply: true,
    },
  });
}

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.command("stats", async (ctx) => {
  const hmm = await getLogs();
  console.log("stats:");
  console.log(hmm);
});

bot.command("log", (ctx) => {
  const userID = Number(ctx.message.from.id);

  if (activeLogs.some((item) => item.userID === userID)) {
    var index = activeLogs.findIndex((item) => item.userID === userID);
    activeLogs.splice(index, 1);
  }

  activeLogs.push({
    userID: userID,
    guild: null,
    sport: null,
    distance: null,
    logState: 0,
  });

  askGuild(ctx);
});

bot.on("text", async (ctx) => {
  // check the data for active log and
  console.log(activeLogs);
});

bot.on("callback_query", async (ctx) => {
  // answer callback
  await ctx.answerCbQuery();

  const userID = Number(ctx.callbackQuery.from.id);
  var activeLogIndex = activeLogs.findIndex((log) => log.userID === userID);

  var dataSplit = ctx.callbackQuery.data.split(" ");

  var logType = dataSplit[0];
  var logData = dataSplit[1];

  // check what to do with cb data
  if (logType === "sport") {
    // TODO: add error handling
    activeLogs[activeLogIndex].sport = logData;

    askDistance(ctx);
  } else if (logType === "guild") {
    // TODO: add error handling
    activeLogs[activeLogIndex].guild = logData;

    askSport(ctx);
  }
});

bot.launch();

console.log("running bot");

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
