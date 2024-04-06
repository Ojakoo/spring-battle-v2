import db from "./db.js";
import { users, logs, guild, sport } from "./schema.js";

// TODO: gotta be smarter way

const guildVals = guild.enumValues;

const kik = guildVals[0];
const sik = guildVals[1];

const sportVals = sport.enumValues;

const running = sportVals[0];
const biking = sportVals[1];
const activity = sportVals[2];

// TODO: seed like 20 users and x logs

const userValues = [
  {
    id: 1,
    userName: "asd",
    guild: sik,
  },
  {
    id: 2,
    userName: "asd",
    guild: sik,
  },
  {
    id: 3,
    userName: "asd",
    guild: sik,
  },
  {
    id: 4,
    userName: "asd",
    guild: sik,
  },
  {
    id: 5,
    userName: "asd",
    guild: kik,
  },
  {
    id: 6,
    userName: "asd",
    guild: kik,
  },
  {
    id: 7,
    userName: "asd",
    guild: kik,
  },
  {
    id: 8,
    userName: "asd",
    guild: kik,
  },
  {
    id: 9,
    userName: "asd",
    guild: kik,
  },
];

await db.insert(users).values(userValues).onConflictDoNothing();

const logValues = [
  {
    userId: 1,
    guild: sik,
    sport: running,
    distance: 10,
  },
  {
    userId: 1,
    guild: sik,
    sport: running,
    distance: 10,
  },
  {
    userId: 2,
    guild: sik,
    sport: biking,
    distance: 10,
  },
  {
    userId: 3,
    guild: sik,
    sport: activity,
    distance: 10,
  },
  {
    userId: 5,
    guild: sik,
    sport: running,
    distance: 10,
  },
  {
    userId: 6,
    guild: sik,
    sport: running,
    distance: 10,
  },
  {
    userId: 9,
    guild: kik,
    sport: biking,
    distance: 10,
  },
  {
    userId: 5,
    guild: kik,
    sport: running,
    distance: 10,
  },
  {
    userId: 5,
    guild: kik,
    sport: activity,
    distance: 10,
  },
  {
    userId: 8,
    guild: kik,
    sport: running,
    distance: 10,
  },
];

await db.insert(logs).values(logValues).onConflictDoNothing();

process.exit();
