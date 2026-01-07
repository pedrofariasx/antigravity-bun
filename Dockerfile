# Estágio de Build
FROM oven/bun:1 AS builder

WORKDIR /app

# Copiar arquivos de dependências
COPY package.json bun.lockb ./

# Instalar dependências
RUN bun install --frozen-lockfile

# Copiar o restante do código
COPY . .

# Gerar o build da aplicação NestJS
RUN bun run build

# Estágio de Produção
FROM oven/bun:1-slim

WORKDIR /app

# Copiar apenas os arquivos necessários do estágio de build
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Expor as portas para API Proxy e Admin Dashboard
EXPOSE 3000
EXPOSE 3001

# Comando para iniciar a aplicação
CMD ["bun", "run", "start:prod"]