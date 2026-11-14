# Image pour Hugging Face Spaces, Render, Koyeb, Fly.io…
FROM node:22-alpine
WORKDIR /app
COPY . .
RUN mkdir -p data && chown -R node:node /app
USER node
ENV PORT=7860
EXPOSE 7860
CMD ["node", "server.js"]
