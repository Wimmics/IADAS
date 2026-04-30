FROM node:18-alpine

# Installation de Python, Java et Docker CLI pour la pipeline
RUN apk add --no-cache \
    python3 \
    py3-pip \
    openjdk17-jre-headless \
    docker-cli \
    wget

WORKDIR /app

# Installation dépendances Node.js
COPY package.json ./
RUN npm install

# Créer le dossier pipeline-ontologie AVANT le téléchargement
RUN mkdir -p /app/pipeline-ontologie

# Télécharger RMLMapper JAR pour la pipeline
RUN wget -O /app/pipeline-ontologie/rmlmapper-7.3.3-r374-all.jar \
    https://github.com/RMLio/rmlmapper-java/releases/download/v7.3.3/rmlmapper-7.3.3-r374-all.jar || \
    wget -O /app/pipeline-ontologie/rmlmapper-7.3.3-r374-all.jar \
    https://github.com/RMLio/rmlmapper-java/releases/download/v6.2.2/rmlmapper-6.2.2-r371-all.jar

# Copie du code
COPY . .

EXPOSE 8005

CMD ["npm", "start"]