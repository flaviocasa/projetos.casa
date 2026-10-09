FROM node:24-bookworm-slim AS verify
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json *.ts ./
COPY test ./test
COPY public ./public
RUN npm run typecheck && npm test

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=verify /app/package.json ./package.json
COPY --from=verify /app/public ./public
COPY --from=verify /app/server.ts /app/core.ts /app/knowledge.ts /app/init-budget.ts ./
ENV HOST=0.0.0.0 STATE_DIR=/data/portal API_ENABLED=false BUDGET_APPROVED=false KNOWLEDGE_APPROVED=false
CMD ["node", "server.ts"]
