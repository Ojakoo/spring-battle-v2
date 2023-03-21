FROM node:alpine3.16

COPY package.json . 
RUN npm install --quiet

COPY . . 

CMD ["node", "index.js"]