# Estágio de Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm install

# Copiar o restante do código
COPY . .

# Gerar o build da aplicação NestJS
RUN npm run build

# Estágio de Produção
FROM node:20-alpine

WORKDIR /app

# Copiar apenas os arquivos necessários do estágio de build
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Expor a porta que a aplicação utiliza
EXPOSE 3000

# Comando para iniciar a aplicação
CMD ["npm", "run", "start:prod"]