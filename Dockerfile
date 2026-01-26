FROM node:20-slim
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# Generate Prisma client at build time (not runtime)
RUN npx prisma generate

RUN npm run build

CMD ["npm", "run", "start"]
