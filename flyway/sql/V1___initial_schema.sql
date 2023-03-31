CREATE TYPE GUILD AS ENUM ('SIK', 'KIK');
CREATE TYPE SPORT AS ENUM ('Running', 'Walking', 'Biking');

CREATE TABLE users (
  user_id INTEGER PRIMARY KEY,
  user_name TEXT NOT NULL,
  guild GUILD NOT NULL
);

CREATE TABLE logs (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id INTEGER NOT NULL REFERENCES users(user_id),
  guild GUILD NOT NULL,
  sport SPORT NOT NULL,
  distance FLOAT NOT NULL
);

CREATE INDEX log_user_id_index ON logs (user_id);
CREATE INDEX log_guild_index ON logs (guild);