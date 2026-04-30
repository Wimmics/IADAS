FROM node:18-slim

WORKDIR /app

COPY package*.json ./

RUN npm install
RUN npm install http-proxy


COPY . .

EXPOSE 8000

CMD ["node", "index.js"]
