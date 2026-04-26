FROM node:20-alpine as base

# Install pnpm
RUN npm install -g pnpm

FROM base as builder

WORKDIR /home/node/app
COPY package.json pnpm-lock.yaml ./

ENV CI=true
COPY . .
RUN pnpm install --frozen-lockfile

FROM base as runtime

ENV NODE_ENV=production

WORKDIR /home/node/app
COPY package.json pnpm-lock.yaml ./

RUN pnpm install --prod

COPY --from=builder /home/node/app /home/node/app

EXPOSE 3000

CMD ["pnpm", "dev"]
