# 🚀 Antigravity

> **⚠️ Warning**: This project uses internal Google APIs. Use at your own risk.

**Antigravity** is a proxy compatible with OpenAI and Anthropic APIs, utilizing Google's Gemini API (Antigravity) as the backend. It allows you to use models like Claude and GPT through free Google accounts.

## 📋 Table of Contents

- [How It Works](#-how-it-works)
- [Installation](#-installation)
- [Initial Setup](#-initial-setup)
- [Dashboard](#-dashboard)
- [API Keys](#-api-keys)
- [API Endpoints](#-api-endpoints)
- [Available Models](#-available-models)
- [Thinking Mode](#-thinking-mode)
- [Account Rotation](#-account-rotation)
- [Database](#-database)
- [Docker](#-docker)

---

## 🔄 How It Works

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Your App      │────▶│   Antigravity   │────▶│  Google API     │
│  (OpenAI SDK)   │◀────│     Proxy       │◀────│  (Antigravity)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

1. **Your application** sends requests in OpenAI or Anthropic format.
2. **Antigravity** translates them to the Google Antigravity format.
3. **Google API** processes and returns the response.
4. **Antigravity** converts it back to the expected format.

**Benefits:**

- ✅ Use existing OpenAI/Anthropic SDKs without modification
- ✅ Automatic rotation of multiple Google accounts
- ✅ Real-time monitoring dashboard
- ✅ SQLite persisted request logs
- ✅ API Key system for access control

---

## 📦 Installation

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/antigravity.git
cd antigravity

# Install dependencies
npm install

# Copy configuration file
cp .env.example .env

# Start in development mode
npm run start:dev
```

The server will be available at `http://localhost:3000`

---

## ⚙️ Initial Setup

### 1. Configure Dashboard Credentials

Edit the `.env` file:

```env
# Credentials to access the Dashboard
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=your_secure_password
```

### 2. Add Google Accounts

There are two ways to add accounts:

#### Option A: Via Web Interface (Recommended)

1. Access `http://localhost:3000/`
2. Log in with dashboard credentials
3. Click on **"Add Account"**
4. Authenticate with your Google account
5. The account will be automatically saved to the database

#### Option B: Via Environment Variables (Initial Migration)

```env
ANTIGRAVITY_ACCOUNTS_1='{"email":"account1@gmail.com","accessToken":"ya29.xxx","refreshToken":"1//xxx","expiryDate":1749123456789}'
ANTIGRAVITY_ACCOUNTS_2='{"email":"account2@gmail.com","accessToken":"ya29.yyy","refreshToken":"1//yyy","expiryDate":1749123456789}'
```

> **Note**: Accounts from `.env` are migrated to SQLite on the first run.

---

## 🖥️ Dashboard

The Dashboard offers a complete web interface for management:

**URL:** `http://localhost:3000/`

### Features

| Section       | Description                                     |
| ------------- | ----------------------------------------------- |
| **Dashboard** | Overview of accounts, status, and quota         |
| **Models**    | List of available models and their capabilities |
| **API Keys**  | API key management                              |
| **Docs**      | Interactive Swagger documentation               |

### Displayed Metrics

- Total configured accounts
- Ready accounts
- Accounts in cooldown (temporarily rate-limited)
- Accounts with errors
- Usage quota per model

---

## 🔑 API Keys

The API Keys system allows controlling access to the proxy API.

### Create an API Key

1. Go to Dashboard → **API Keys**
2. Click on **"Create API Key"**
3. Define a name and limits (optional)
4. Copy the generated key

### Use the API Key

Include the key in the `Authorization` header:

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-ag-xxxxx" \
  -H "Content-Type: application/json" \
  -d '{"model": "gemini-2.5-flash", "messages": [{"role": "user", "content": "Hello!"}]}'
```

### Open vs Protected Mode

- **No API Keys created**: API is open (anyone can use it)
- **With API Keys created**: Only authenticated requests are accepted

---

## 🌐 API Endpoints

| Endpoint               | Method | Format    | Description     |
| ---------------------- | ------ | --------- | --------------- |
| `/v1/chat/completions` | POST   | OpenAI    | Chat completion |
| `/v1/messages`         | POST   | Anthropic | Claude messages |
| `/v1/models`           | GET    | OpenAI    | List models     |
| `/v1/quota`            | GET    | -         | Quota status    |
| `/docs`                | GET    | Swagger   | API Docs        |
| `/health`              | GET    | -         | Health check    |

### Dashboard Endpoints

| Endpoint           | Description           |
| ------------------ | --------------------- |
| `/`                | Main dashboard        |
| `/login`           | Login page            |
| `/accounts/add`    | Add Google account    |
| `/accounts/status` | Account status (JSON) |

---

## 🤖 Available Models

| Model                   | Original Provider | Max Tokens |
| ----------------------- | ----------------- | ---------- |
| `gemini-3-pro-preview`  | Google            | 65,536     |
| `gemini-3-flash`        | Google            | 65,536     |
| `gemini-2.5-flash`      | Google            | 65,536     |
| `gemini-2.5-flash-lite` | Google            | 65,536     |
| `claude-sonnet-4-5`     | Anthropic         | 64,000     |
| `claude-opus-4-5`       | Anthropic         | 64,000     |
| `gpt-oss-120b-medium`   | OpenAI            | 32,768     |

---

## 🧠 Thinking Mode

Activate thinking mode for more elaborate responses:

```json
{
  "model": "claude-sonnet-4-5",
  "messages": [{ "role": "user", "content": "Solve this equation..." }],
  "reasoning_effort": "high",
  "stream": true
}
```

### Available Levels

| Level    | Description                              |
| -------- | ---------------------------------------- |
| `low`    | Basic reasoning, faster responses        |
| `medium` | Balance between speed and depth          |
| `high`   | Deep reasoning, more elaborate responses |

### Behavior by Model

| Model                  | Implementation                            |
| ---------------------- | ----------------------------------------- |
| `gemini-3-pro-preview` | Uses `thinkingLevel` (low/high)           |
| `gemini-2.5-flash`     | Uses `thinkingBudget`                     |
| `claude-sonnet-4-5`    | Uses `thinkingBudget` (8k/16k/32k tokens) |
| `claude-opus-4-5`      | Always uses thinking (optional parameter) |

> **Limitation**: Claude models only return `reasoning_content` in streaming mode.

---

## 🔄 Account Rotation

Antigravity automatically manages multiple Google accounts:

### How It Works

1. **Smart Selection**: Chooses the account with the most available quota.
2. **Automatic Cooldown**: Rate-limited accounts enter cooldown.
3. **Recovery**: Accounts return to the pool after the cooldown period.

### Configuration

```env
# Base cooldown time (ms)
COOLDOWN_DURATION_MS=60000

# Max attempts before error
MAX_RETRY_ACCOUNTS=3
```

### Account States

| Status     | Description                            |
| ---------- | -------------------------------------- |
| `ready`    | Ready for use                          |
| `cooldown` | Rate limited, waiting for recovery     |
| `error`    | Persistent error (invalid token, etc.) |

---

## 💾 Database

Antigravity uses SQLite for persistence:

**Location:** `data/antigravity.db`

### Tables

| Table          | Description                      |
| -------------- | -------------------------------- |
| `accounts`     | Google accounts (tokens, status) |
| `api_keys`     | Managed API keys                 |
| `request_logs` | Logs of all requests             |
| `sessions`     | Dashboard sessions               |

### Request Logs

Each request is logged with:

- Used model
- Input/output tokens
- Latency (ms)
- Status (success/error)
- Used API key
- Timestamp

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
  -e DASHBOARD_PASSWORD=secure_password \
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
      - DASHBOARD_PASSWORD=secure_password
    restart: unless-stopped
```

---

## 📁 Project Structure

```
antigravity/
├── src/
│   ├── accounts/        # Google accounts management
│   ├── antigravity/     # Proxy logic (transformers, service)
│   ├── api-keys/        # API keys system
│   ├── auth/            # Dashboard authentication
│   ├── common/          # Shared utilities
│   ├── config/          # Configuration
│   ├── database/        # SQLite service
│   ├── oauth/           # Google OAuth flow
│   └── quota/           # Quota management
├── public/              # Dashboard assets
├── data/                # SQLite database
└── docs/                # Additional documentation
```

---

## 🔧 Environment Variables

| Variable               | Default | Description           |
| ---------------------- | ------- | --------------------- |
| `PORT`                 | 3000    | Server port           |
| `DASHBOARD_USERNAME`   | admin   | Dashboard username    |
| `DASHBOARD_PASSWORD`   | admin   | Dashboard password    |
| `COOLDOWN_DURATION_MS` | 60000   | Cooldown time (ms)    |
| `MAX_RETRY_ACCOUNTS`   | 3       | Attempts before error |

---

## 📄 License

MIT

---

## 🤝 Contributing

Contributions are welcome! Please open an issue or pull request.
