FROM node:alpine3.16

WORKDIR /usr/app

COPY package.json .
RUN npm install

COPY . . 

CMD [ "npm", "run", "start" ]