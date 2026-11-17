FROM node:22-slim
# ffmpeg : retire les métadonnées (GPS, appareil) des vidéos de témoignages
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p data && chown -R node:node /app && chmod +x docker-entrypoint.sh
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
EXPOSE 3000
# Démarre en root juste le temps de donner le disque à « node », puis tourne en « node ».
CMD ["./docker-entrypoint.sh"]
