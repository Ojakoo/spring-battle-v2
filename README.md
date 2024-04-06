# Spring Battle Bot

Telegram bot used for the annual SIK-KIK spring battle.

## Development

Run the bot with:

```
npm run dev
```

Run migrations and seed the db with (while dev is running):

```
npm run db:migrate
npm run db:seed
```

To create new migartions on changes to the db schema use

```
npm run db:generate
```

TODO: [Using ts-node with node 20](https://github.com/TypeStrong/ts-node/issues/1997) breaks stack traces due to --loader, now uses tsx but this doesnt have type checking. Working ts node run should be:

```
"dev": "nodemon --watch index.ts --exec node --loader ts-node/esm index.ts",
```
