# 🚀 Antigravity API

> **⚠️ Aviso**: Este projeto utiliza APIs internas do Google. Use por sua conta e risco.

**Antigravity** é um proxy compatível com as APIs da OpenAI e Anthropic, utilizando a API Gemini do Google (Antigravity) como backend. Ele permite que você use modelos como Claude e GPT através de contas gratuitas do Google.

## 📋 Índice

- [Como Funciona](#-como-funciona)
- [Instalação](#-instalação)
- [Configuração Inicial](#-configuração-inicial)
- [Dashboard](#-dashboard)
- [Chaves de API (API Keys)](#-api-keys)
- [Endpoints da API](#-api-endpoints)
- [Modelos Disponíveis](#-disponíveis-models)
- [Modo de Raciocínio (Thinking)](#-thinking-mode)
- [Rotação de Contas](#-account-rotation)
- [Banco de Dados](#-database)
- [Docker](#-docker)

---

## 🔄 Como Funciona

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Seu App       │────▶│   Antigravity   │────▶│  Google API     │
│  (OpenAI SDK)   │◀────│     Proxy       │◀────│  (Antigravity)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

1. **Sua aplicação** envia requisições no formato OpenAI ou Anthropic.
2. **Antigravity** as traduz para o formato do Google Antigravity.
3. **Google API** processa e retorna a resposta.
4. **Antigravity** converte de volta para o formato esperado.

**Benefícios:**

- ✅ Use SDKs existentes da OpenAI/Anthropic sem modificação.
- ✅ Rotação automática de múltiplas contas do Google.
- ✅ Dashboard de monitoramento em tempo real.
- ✅ Logs de requisições persistidos em SQLite.
- ✅ Sistema de Chaves de API para controle de acesso.

---

## 📦 Instalação

### Pré-requisitos

- Node.js 18+
- npm ou yarn

### Instalação

```bash
# Clone o repositório
git clone https://github.com/pedrofariasx/antigravity.git
cd antigravity

# Instale as dependências
npm install

# Copie o arquivo de configuração
cp .env.example .env

# Inicie em modo de desenvolvimento
npm run start:dev
```

O servidor estará disponível em `http://localhost:3000`

---

## ⚙️ Configuração Inicial

### 1. Configurar Credenciais do Dashboard

Edite o arquivo `.env`:

```env
# Credenciais para acessar o Dashboard
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=sua_senha_segura
```

### 2. Adicionar Contas do Google

Existem duas formas de adicionar contas:

#### Opção A: Via Interface Web (Recomendado)

1. Acesse `http://localhost:3000/`
2. Faça login com as credenciais do dashboard.
3. Clique em **"Add Account"**.
4. Autentique-se com sua conta do Google.
5. A conta será salva automaticamente no banco de dados.

#### Opção B: Via Variáveis de Ambiente (Migração Inicial)

```env
ANTIGRAVITY_ACCOUNTS_1='{"email":"conta1@gmail.com","accessToken":"ya29.xxx","refreshToken":"1//xxx","expiryDate":1749123456789}'
ANTIGRAVITY_ACCOUNTS_2='{"email":"conta2@gmail.com","accessToken":"ya29.yyy","refreshToken":"1//yyy","expiryDate":1749123456789}'
```

> **Nota**: Contas do `.env` são migradas para o SQLite na primeira execução.

---

## 🖥️ Dashboard

O Dashboard oferece uma interface web completa para gerenciamento:

**URL:** `http://localhost:3000/`

### Funcionalidades

| Seção         | Descrição                                       |
| ------------- | ----------------------------------------------- |
| **Dashboard** | Visão geral das contas, status e cotas          |
| **Models**    | Lista de modelos disponíveis e suas capacidades |
| **API Keys**  | Gerenciamento de chaves de API                  |
| **Docs**      | Documentação interativa do Swagger              |

### Métricas Exibidas

- Total de contas configuradas.
- Contas prontas (Ready).
- Contas em cooldown (temporariamente limitadas por taxa).
- Contas com erros.
- Cota de uso por modelo.

---

## 🔑 Chaves de API (API Keys)

O sistema de Chaves de API permite controlar o acesso à API do proxy.

### Criar uma Chave de API

1. Vá para Dashboard → **API Keys**.
2. Clique em **"Create API Key"**.
3. Defina um nome e limites (opcional).
4. Copie a chave gerada.

### Usar a Chave de API

Inclua a chave no cabeçalho `Authorization`:

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-ag-xxxxx" \
  -H "Content-Type: application/json" \
  -d '{"model": "gemini-2.5-flash", "messages": [{"role": "user", "content": "Olá!"}]}'
```

### Modo Aberto vs Protegido

- **Sem Chaves de API criadas**: A API fica aberta (qualquer um pode usar).
- **Com Chaves de API criadas**: Apenas requisições autenticadas são aceitas.

---

## 🌐 Endpoints da API

| Endpoint               | Método | Formato   | Descrição                  |
| ---------------------- | ------ | --------- | -------------------------- |
| `/v1/chat/completions` | POST   | OpenAI    | Chat completion            |
| `/v1/messages`         | POST   | Anthropic | Mensagens Claude           |
| `/v1/models`           | GET    | OpenAI    | Lista de modelos           |
| `/v1/quota`            | GET    | -         | Status da cota             |
| `/docs`                | GET    | Swagger   | Documentação da API        |
| `/health`              | GET    | -         | Verificação de integridade |

### Endpoints do Dashboard

| Endpoint           | Descrição              |
| ------------------ | ---------------------- |
| `/`                | Dashboard principal    |
| `/login`           | Página de login        |
| `/accounts/add`    | Adicionar conta Google |
| `/accounts/status` | Status da conta (JSON) |

---

## 🤖 Modelos Disponíveis

| Modelo                  | Provedor Original | Max Tokens |
| ----------------------- | ----------------- | ---------- |
| `gemini-3-pro-preview`  | Google            | 65,536     |
| `gemini-3-flash`        | Google            | 65,536     |
| `gemini-2.5-flash`      | Google            | 65,536     |
| `gemini-2.5-flash-lite` | Google            | 65,536     |
| `claude-sonnet-4-5`     | Anthropic         | 64,000     |
| `claude-opus-4-5`       | Anthropic         | 64,000     |
| `gpt-oss-120b-medium`   | OpenAI            | 32,768     |

---

## 🧠 Modo de Raciocínio (Thinking)

Ative o modo de raciocínio para respostas mais elaboradas:

```json
{
  "model": "claude-sonnet-4-5",
  "messages": [{ "role": "user", "content": "Resolva esta equação..." }],
  "reasoning_effort": "high",
  "stream": true
}
```

### Níveis Disponíveis

| Nível    | Descrição                                      |
| -------- | ---------------------------------------------- |
| `low`    | Raciocínio básico, respostas mais rápidas      |
| `medium` | Equilíbrio entre velocidade e profundidade     |
| `high`   | Raciocínio profundo, respostas mais elaboradas |

### Comportamento por Modelo

| Modelo                 | Implementação                            |
| ---------------------- | ---------------------------------------- |
| `gemini-3-pro-preview` | Usa `thinkingLevel` (low/high)           |
| `gemini-2.5-flash`     | Usa `thinkingBudget`                     |
| `claude-sonnet-4-5`    | Usa `thinkingBudget` (8k/16k/32k tokens) |
| `claude-opus-4-5`      | Sempre usa thinking (parâmetro opcional) |

> **Limitação**: Modelos Claude só retornam `reasoning_content` em modo streaming.

---

## 🔄 Rotação de Contas

O Antigravity gerencia automaticamente múltiplas contas do Google:

### Como Funciona

1. **Seleção Inteligente**: Escolhe a conta com a maior cota disponível.
2. **Cooldown Automático**: Contas com limite de taxa entram em cooldown.
3. **Recuperação**: As contas retornam ao pool após o período de cooldown.

### Configuração

```env
# Tempo base de cooldown (ms)
COOLDOWN_DURATION_MS=60000

# Máximo de tentativas antes do erro
MAX_RETRY_ACCOUNTS=3
```

### Estados da Conta

| Status     | Descrição                               |
| ---------- | --------------------------------------- |
| `ready`    | Pronta para uso                         |
| `cooldown` | Limite de taxa, aguardando recuperação  |
| `error`    | Erro persistente (token inválido, etc.) |

---

## 💾 Banco de Dados

O Antigravity usa SQLite para persistência:

**Localização:** `data/antigravity.db`

### Tabelas

| Tabela         | Descrição                      |
| -------------- | ------------------------------ |
| `accounts`     | Contas Google (tokens, status) |
| `api_keys`     | Chaves de API gerenciadas      |
| `request_logs` | Logs de todas as requisições   |
| `sessions`     | Sessões do dashboard           |

### Logs de Requisição

Cada requisição é registrada com:

- Modelo utilizado.
- Tokens de entrada/saída.
- Latência (ms).
- Status (sucesso/erro).
- Chave de API usada.
- Carimbo de data/hora (Timestamp).

---

## 🐳 Docker

### Build

```bash
docker build -t antigravity .
```

### Run

```bash
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e DASHBOARD_USERNAME=admin \
  -e DASHBOARD_PASSWORD=senha_segura \
  antigravity
```

### Docker Compose

```yaml
version: '3.8'
services:
  antigravity:
    build: .
    ports:
      - '3000:3000'
    volumes:
      - ./data:/app/data
    environment:
      - DASHBOARD_USERNAME=admin
      - DASHBOARD_PASSWORD=senha_segura
    restart: unless-stopped
```

---

## 📁 Estrutura do Projeto

```
antigravity/
├── src/
│   ├── accounts/        # Gerenciamento de contas Google
│   ├── antigravity/     # Lógica do proxy (transformadores, serviço)
│   ├── api-keys/        # Sistema de chaves de API
│   ├── auth/            # Autenticação do dashboard
│   ├── common/          # Utilitários compartilhados
│   ├── config/          # Configuração
│   ├── database/        # Serviço SQLite
│   ├── oauth/           # Fluxo Google OAuth
│   └── quota/           # Gerenciamento de cota
├── public/              # Ativos do dashboard
├── data/                # Banco de dados SQLite
└── docs/                # Documentação adicional
```

---

## 🔧 Variáveis de Ambiente

| Variável               | Padrão | Descrição                |
| ---------------------- | ------ | ------------------------ |
| `PORT`                 | 3000   | Porta do servidor        |
| `DASHBOARD_USERNAME`   | admin  | Usuário do dashboard     |
| `DASHBOARD_PASSWORD`   | admin  | Senha do dashboard       |
| `COOLDOWN_DURATION_MS` | 60000  | Tempo de cooldown (ms)   |
| `MAX_RETRY_ACCOUNTS`   | 3      | Tentativas antes do erro |

---

## 📄 Licença

MIT

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor, abra uma issue ou pull request.
