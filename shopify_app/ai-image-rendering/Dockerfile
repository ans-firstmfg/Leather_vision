FROM node:22-alpine AS build
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci && npm cache clean --force

COPY . .

RUN npm run prisma -- generate
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL=file:/app/storage/dev.sqlite
ENV GENERATION_DATA_DIR=/app/storage/images
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/prisma ./prisma
COPY scripts/prisma.mjs ./scripts/prisma.mjs
RUN mkdir -p /app/storage/images && chown -R node:node /app
USER node
EXPOSE 3000
VOLUME ["/app/storage"]

CMD ["npm", "run", "docker-start"]
