Expose localhost port to outside on dev:

```
http ngrok 3000
```

Connect telegram webhook:

```
https://api.telegram.org/bot{BOT_TOKEN}/setWebhook?url={DEPLOY_URL}
```

Runnig the application:

```
sudo docker compose up --build
```

TODO: using ts-node withnode 20 break stack traces due to --loader, alternaticely could use tsx but this doesnt have type checking
"dev": "nodemon --watch index.ts --exec node --loader ts-node/esm index.ts",

https://github.com/TypeStrong/ts-node/issues/1997
