# Estágio de Build
FROM oven/bun:1 AS builder

WORKDIR /app

# Copiar arquivos de dependências
COPY package.json bun.lock ./

# Instalar dependências
RUN bun install --frozen-lockfile

# Copiar o restante do código
COPY . .

# (Opcional) Testar se o build funciona
RUN bun run build

# Estágio de Produção
FROM oven/bun:1-slim

WORKDIR /app

# Copiar arquivos necessários
COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lock ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public
COPY --from=builder /app/tsconfig.json ./

# Expor as portas para API Proxy e Admin Dashboard
EXPOSE 3000
EXPOSE 3001

# Comando para iniciar a aplicação
CMD ["bun", "run", "start:prod"]