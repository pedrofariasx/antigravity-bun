import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import Database from 'better-sqlite3';
import { join } from 'path';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private db: Database.Database;

  onModuleInit() {
    this.initDatabase();
  }

  private initDatabase() {
    // Use absolute path to ensure consistency across process forks
    const dbPath = join(__dirname, '..', '..', 'data', 'antigravity.db');

    // Ensure data directory exists
    const fs = require('fs');
    const dataDir = join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    this.initTables();
    this.logger.log(`SQLite database initialized at ${dbPath}`);
  }

  onModuleDestroy() {
    if (this.db) {
      this.db.close();
      this.logger.log('Database connection closed');
    }
  }

  private initTables() {
    // API Keys table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used_at DATETIME,
        is_active INTEGER DEFAULT 1,
        requests_count INTEGER DEFAULT 0,
        tokens_used INTEGER DEFAULT 0,
        daily_limit INTEGER DEFAULT 0,
        rate_limit_per_minute INTEGER DEFAULT 60
      )
    `);

    // Migration: ensure columns exist for older databases
    const migrationColumns = [
      { name: 'requests_count', type: 'INTEGER DEFAULT 0' },
      { name: 'tokens_used', type: 'INTEGER DEFAULT 0' },
      { name: 'daily_limit', type: 'INTEGER DEFAULT 0' },
      { name: 'rate_limit_per_minute', type: 'INTEGER DEFAULT 60' },
    ];

    for (const col of migrationColumns) {
      try {
        this.db.exec(`ALTER TABLE api_keys ADD COLUMN ${col.name} ${col.type}`);
        this.logger.log(`Added column ${col.name} to api_keys table`);
      } catch {
        // Column already exists, ignore
      }
    }

    // Fix NULL values in existing records
    this.db.exec(`
      UPDATE api_keys SET
        requests_count = COALESCE(requests_count, 0),
        tokens_used = COALESCE(tokens_used, 0),
        daily_limit = COALESCE(daily_limit, 0),
        rate_limit_per_minute = COALESCE(rate_limit_per_minute, 60)
      WHERE requests_count IS NULL OR tokens_used IS NULL OR daily_limit IS NULL OR rate_limit_per_minute IS NULL
    `);

    // Request logs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS request_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_key_id INTEGER,
        model TEXT,
        tokens_input INTEGER DEFAULT 0,
        tokens_output INTEGER DEFAULT 0,
        latency_ms INTEGER,
        status TEXT,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
      )
    `);

    // Sessions table for dashboard auth
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL
      )
    `);

    // Accounts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expiry_date INTEGER NOT NULL,
        project_id TEXT,
        status TEXT DEFAULT 'ready',
        last_used_at DATETIME,
        request_count INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
      CREATE INDEX IF NOT EXISTS idx_request_logs_api_key_id ON request_logs(api_key_id);
      CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
    `);

    this.logger.log('Database tables initialized');
  }

  getDb(): Database.Database {
    return this.db;
  }

  // API Keys methods
  createApiKey(
    name: string,
    key: string,
    dailyLimit = 0,
    rateLimitPerMinute = 60,
  ) {
    const stmt = this.db.prepare(`
      INSERT INTO api_keys (key, name, daily_limit, rate_limit_per_minute)
      VALUES (?, ?, ?, ?)
    `);
    return stmt.run(key, name, dailyLimit, rateLimitPerMinute);
  }

  getApiKeyByKey(key: string) {
    const stmt = this.db.prepare(
      'SELECT * FROM api_keys WHERE key = ? AND is_active = 1',
    );
    return stmt.get(key);
  }

  getAllApiKeys() {
    const stmt = this.db.prepare(
      'SELECT id, name, key, created_at, last_used_at, is_active, requests_count, tokens_used, daily_limit, rate_limit_per_minute FROM api_keys ORDER BY created_at DESC',
    );
    return stmt.all();
  }

  updateApiKeyUsage(keyId: number, tokensUsed: number) {
    const stmt = this.db.prepare(`
      UPDATE api_keys 
      SET requests_count = requests_count + 1, 
          tokens_used = tokens_used + ?,
          last_used_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    return stmt.run(tokensUsed, keyId);
  }

  deactivateApiKey(keyId: number) {
    const stmt = this.db.prepare(
      'UPDATE api_keys SET is_active = 0 WHERE id = ?',
    );
    return stmt.run(keyId);
  }

  activateApiKey(keyId: number) {
    const stmt = this.db.prepare(
      'UPDATE api_keys SET is_active = 1 WHERE id = ?',
    );
    return stmt.run(keyId);
  }

  deleteApiKey(keyId: number) {
    const stmt = this.db.prepare('DELETE FROM api_keys WHERE id = ?');
    return stmt.run(keyId);
  }

  // Request logs methods
  logRequest(
    apiKeyId: number | null,
    model: string,
    tokensInput: number,
    tokensOutput: number,
    latencyMs: number,
    status: string,
    errorMessage?: string,
  ) {
    const stmt = this.db.prepare(`
      INSERT INTO request_logs (api_key_id, model, tokens_input, tokens_output, latency_ms, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      apiKeyId,
      model,
      tokensInput,
      tokensOutput,
      latencyMs,
      status,
      errorMessage || null,
    );
  }

  getRecentLogs(limit = 100) {
    const stmt = this.db.prepare(`
      SELECT rl.*, ak.name as api_key_name
      FROM request_logs rl
      LEFT JOIN api_keys ak ON rl.api_key_id = ak.id
      ORDER BY rl.created_at DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  getStatsForToday() {
    const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total_requests,
        SUM(tokens_input + tokens_output) as total_tokens,
        AVG(latency_ms) as avg_latency,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count
      FROM request_logs
      WHERE DATE(created_at) = DATE('now')
    `);
    return stmt.get();
  }

  // Session methods
  createSession(sessionId: string, expiresAt: Date) {
    const stmt = this.db.prepare(
      'INSERT INTO sessions (id, expires_at) VALUES (?, ?)',
    );
    return stmt.run(sessionId, expiresAt.toISOString());
  }

  getSession(sessionId: string) {
    const stmt = this.db.prepare(
      "SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')",
    );
    return stmt.get(sessionId);
  }

  deleteSession(sessionId: string) {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
    return stmt.run(sessionId);
  }

  cleanExpiredSessions() {
    const stmt = this.db.prepare(
      "DELETE FROM sessions WHERE expires_at <= datetime('now')",
    );
    return stmt.run();
  }

  // Accounts methods
  upsertAccount(acc: any) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO accounts (id, email, access_token, refresh_token, expiry_date, project_id)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          expiry_date = excluded.expiry_date,
          project_id = COALESCE(excluded.project_id, accounts.project_id)
      `);
      const result = stmt.run(
        acc.id,
        acc.email,
        acc.accessToken,
        acc.refreshToken,
        acc.expiryDate,
        acc.projectId || null,
      );
      this.logger.log(`Account ${acc.email} saved to SQLite`);
      return result;
    } catch (e) {
      this.logger.error(`SQLite error in upsertAccount: ${e.message}`);
      throw e;
    }
  }

  getAccounts() {
    return this.db.prepare('SELECT * FROM accounts').all();
  }

  updateAccountStatus(id: string, status: string) {
    return this.db
      .prepare('UPDATE accounts SET status = ? WHERE id = ?')
      .run(status, id);
  }

  incrementAccountUsage(id: string, isError: boolean = false) {
    const errorInc = isError ? 1 : 0;
    const reqInc = 1;
    return this.db
      .prepare(
        `
      UPDATE accounts
      SET request_count = request_count + ?,
          error_count = error_count + ?,
          last_used_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      )
      .run(reqInc, errorInc, id);
  }

  deleteAccount(id: string) {
    return this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  }

  resetDatabase() {
    this.logger.warn('Resetting database tables...');
    this.db.exec('DROP TABLE IF EXISTS request_logs');
    this.db.exec('DROP TABLE IF EXISTS api_keys');
    this.db.exec('DROP TABLE IF EXISTS accounts');
    this.db.exec('DROP TABLE IF EXISTS sessions');
    this.initTables();
    return { success: true };
  }
}
