
FROM node:20-alpine

WORKDIR /app


COPY package*.json ./
RUN npm install
RUN npm install node-fetch@2

COPY . .


EXPOSE 8003


CMD ["node", "index.js"]
