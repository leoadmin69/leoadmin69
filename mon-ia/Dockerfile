# Image pour Hugging Face Spaces, Render, Koyeb, Fly.io…
# Inclut git (projets), bash et les outils de build courants pour que l'IA puisse travailler sur des sites.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates curl python3 \
    && rm -rf /var/lib/apt/lists/*
# Optionnel (vrais ordinateurs quantiques IBM, ~300 Mo) : décommente la ligne suivante
# RUN apt-get update && apt-get install -y python3-pip && pip install --break-system-packages qiskit qiskit-ibm-runtime
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p data && chown -R node:node /app
USER node
ENV PORT=7860
EXPOSE 7860
CMD ["node", "server.js"]
