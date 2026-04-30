FROM node:20-alpine

WORKDIR /init

COPY package*.json ./
RUN npm install
Run npm install node-fetch@2

COPY . .

CMD ["node", "index.js"]
