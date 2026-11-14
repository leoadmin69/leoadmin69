# Image de Nova (le code est dans le dossier mon-ia/).
# Ce fichier sert quand l'hébergeur construit depuis la racine du dépôt ; mon-ia/Dockerfile sert
# quand son « Root Directory » est réglé sur mon-ia. Les deux donnent la même image.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates curl python3 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY mon-ia/package*.json ./
RUN npm ci --omit=dev
COPY mon-ia/ .
RUN mkdir -p data && chown -R node:node /app
USER node
ENV PORT=7860
EXPOSE 7860
CMD ["node", "server.js"]
