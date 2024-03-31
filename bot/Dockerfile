FROM node:20-alpine3.18

WORKDIR /app

COPY package.json .
COPY package-lock.json .

RUN npm ci

CMD [ "npm", "run", "dev" ]