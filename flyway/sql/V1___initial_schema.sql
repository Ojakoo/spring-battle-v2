CREATE TYPE GUILD AS ENUM ('SIK', 'KIK');
CREATE TYPE SPORT AS ENUM ('Running/Walking', 'Biking', 'Activity');

CREATE TABLE users (
  user_id BIGINT PRIMARY KEY,
  user_name TEXT NOT NULL,
  guild GUILD
);

CREATE TABLE logs (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  guild GUILD NOT NULL,
  sport SPORT NOT NULL,
  distance FLOAT NOT NULL
);

CREATE TABLE log_events (
  -- ?
  user_id BIGINT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE, 
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sport SPORT DEFAULT NULL
);

CREATE INDEX log_user_id_index ON logs (user_id);
CREATE INDEX log_guild_index ON logs (guild);