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

async function insertLog({ name, age }) {
  const users = await sql`
    INSERT INTO logs
      (user_id, guild, sport, distance)
    VALUES
      (123, SIK, Running, 2)
    RETURNING name, age
  `;
  return users;
}

// bot logic

let activeLogs = [];

const example = {
  userID: "",
  guild: "",
  sport: "",
  distance: "",
  state: 0,
};

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
  await ctx.reply({
    text: "Insert kilometers in 1.1 format.",
    reply_markup: {
      force_reply: true,
    },
  });
}

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.command("stats", async (ctx) => {
  console.log("stats:");
  const hmm = await getLogs();
  console.log(hmm);
});

bot.command("log", (ctx) => {
  console.log(ctx.message);

  // TODO: create db entry

  const userID = ctx.message.from.id;

  if (activeLogs.some((item) => item.userID === userID)) {
    // remove old log item
  } else {
    // TODO: get entry uuid after adding to db
  }

  activeLogs.push({
    userID: userID,
    logState: 0,
  });

  console.log(activeLogs);

  askGuild(ctx);
});

bot.on("text", async (ctx) => {
  // check the data for active log and
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
    // TODO: handle data

    askDistance(ctx);
  } else if (logType === "guild") {
    // TODO: handle data
    askSport(ctx);
  }
});

bot.launch();

console.log("running bot");

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
