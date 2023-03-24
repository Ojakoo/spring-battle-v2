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
