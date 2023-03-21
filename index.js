require("dotenv").config();
const { Telegraf } = require("telegraf");
var mysql = require("mysql");

// connect to db

var connection = mysql.createConnection(process.env.DATABASE_URL);

// CREATE TABLE `Example` (
// 	`id` varchar(191) NOT NULL,
// 	`createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
// 	`updatedAt` datetime(3) NOT NULL,
// 	PRIMARY KEY (`id`)
// ) ENGINE InnoDB,
//   CHARSET utf8mb4,
//   COLLATE utf8mb4_unicode_ci;

// bot logic

let activeLogs = [];

async function askSport(ctx) {
  ctx.reply({
    text: "choose sport",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Running",
            callback_data: `sport 0`,
          },
        ],
        [
          {
            text: "Walking",
            callback_data: `sport 1`,
          },
        ],
        [
          {
            text: "Skiing",
            callback_data: `sport 2`,
          },
        ],
        [
          {
            text: "Biking",
            callback_data: `sport 4`,
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
            callback_data: "guild sik",
          },
        ],
        [
          {
            text: "KIK",
            callback_data: "guild kik",
          },
        ],
      ],
    },
  });
}

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.command("log", (ctx) => {
  console.log(ctx.message);

  // TODO: create db entry

  const userID = ctx.message.from.id;

  if (activeLogs.some((item) => item.userID === userID)) {
    // remove old log item
  } else {
    // TODO: get entry uuid after adding to db
    activeLogs.push({
      userID: userID,
      logState: 0,
    });

    console.log(activeLogs);
  }

  askSport(ctx);
});

bot.on("text", async (ctx) => {
  // if we have
  console.log(ctx);
});

bot.on("callback_query", async (ctx) => {
  // answer callback
  await ctx.answerCbQuery();

  var dataSplit = ctx.callbackQuery.data.split(" ");

  var logType = dataSplit[0];
  var logData = dataSplit[1];

  // check what to do with cb data
  if (logType === "sport") {
    await ctx.reply({
      text: "Insert kilometers in 1.1 format.",
      reply_markup: {
        force_reply: true,
      },
    });
  } else if (logType === "guild") {
    console.log("Guild input");
  }
});

bot.on("inline_query", async (ctx) => {
  console.log(ctx);
  const result = [];
  // Explicit usage
  await ctx.telegram.answerInlineQuery(ctx.inlineQuery.id, result);

  // Using context shortcut
  await ctx.answerInlineQuery(result);
});

bot.launch();

console.log("running bot");

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
