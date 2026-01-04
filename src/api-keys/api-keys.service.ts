import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuthService } from '../auth/auth.service';

export interface ApiKey {
  id: number;
  key: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  is_active: number;
  requests_count: number;
  tokens_used: number;
  daily_limit: number;
  rate_limit_per_minute: number;
  smart_context: number;
  smart_context_limit: number;
  allowed_models: string;
  description: string | null;
  cors_origin: string;
}

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly authService: AuthService,
  ) {}

  createApiKey(
    name: string,
    dailyLimit = 0,
    rateLimitPerMinute = 60,
    smartContext = 0,
    smartContextLimit = 10,
    allowedModels = '*',
    description = '',
    corsOrigin = '*',
  ): { key: string; id: number } {
    const rawKey = this.authService.generateApiKey();
    const hashedKey = this.authService.hashApiKey(rawKey);

    const result = this.databaseService.createApiKey(
      name,
      hashedKey, // Store the hashed key
      dailyLimit,
      rateLimitPerMinute,
      smartContext,
      smartContextLimit,
      allowedModels,
      description,
      corsOrigin,
    );

    this.logger.log(`Created new API key: ${name}`);

    return {
      key: rawKey,
      id: result.lastInsertRowid as number,
    };
  }

  getAllApiKeys(): ApiKey[] {
    return this.databaseService.getAllApiKeys() as ApiKey[];
  }

  getApiKeyByRawKey(rawKey: string): ApiKey | undefined {
    const hash = this.authService.hashApiKey(rawKey);
    return this.databaseService.getApiKeyByHash(hash) as ApiKey | undefined;
  }

  validateApiKey(key: string): { valid: boolean; keyData?: ApiKey } {
    const keyData = this.getApiKeyByRawKey(key);

    if (!keyData) {
      return { valid: false };
    }

    if (!keyData.is_active) {
      return { valid: false };
    }

    return { valid: true, keyData };
  }

  updateUsage(keyId: number, tokensUsed: number): void {
    this.databaseService.updateApiKeyUsage(keyId, tokensUsed);
  }

  deactivateApiKey(keyId: number): boolean {
    const result = this.databaseService.deactivateApiKey(keyId);
    this.logger.log(`Deactivated API key ID: ${keyId}`);
    return result.changes > 0;
  }

  activateApiKey(keyId: number): boolean {
    const result = this.databaseService.activateApiKey(keyId);
    this.logger.log(`Activated API key ID: ${keyId}`);
    return result.changes > 0;
  }

  deleteApiKey(keyId: number): boolean {
    const result = this.databaseService.deleteApiKey(keyId);
    this.logger.log(`Deleted API key ID: ${keyId}`);
    return result.changes > 0;
  }

  toggleSmartContext(keyId: number, enabled: boolean): boolean {
    const result = this.databaseService.updateApiKeySmartContext(
      keyId,
      enabled ? 1 : 0,
    );
    this.logger.log(
      `Smart Context ${enabled ? 'enabled' : 'disabled'} for API key ID: ${keyId}`,
    );
    return result.changes > 0;
  }

  updateApiKey(
    keyId: number,
    data: {
      name?: string;
      dailyLimit?: number;
      rateLimitPerMinute?: number;
      smartContext?: number;
      smartContextLimit?: number;
      allowedModels?: string;
      description?: string;
      corsOrigin?: string;
    },
  ): boolean {
    const result = this.databaseService.updateApiKey(keyId, data);
    this.logger.log(`Updated API key ID: ${keyId}`);
    return result.changes > 0;
  }

  getStats() {
    return this.databaseService.getStatsForToday();
  }

  getAnalyticsData() {
    const logs = this.databaseService.getRecentLogs(500);

    // Group by hour for usage chart
    const usageByHour = new Map<string, number>();
    const latencyByModel = new Map<string, { total: number; count: number }>();

    const now = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(now);
      d.setHours(now.getHours() - i);
      const hourStr = d.getHours().toString().padStart(2, '0') + ':00';
      usageByHour.set(hourStr, 0);
    }

    (logs as any[]).forEach((log) => {
      const date = new Date(log.created_at);
      const hourStr = date.getHours().toString().padStart(2, '0') + ':00';
      const tokens = (log.tokens_input || 0) + (log.tokens_output || 0);

      if (usageByHour.has(hourStr)) {
        usageByHour.set(hourStr, (usageByHour.get(hourStr) || 0) + tokens);
      }

      if (log.latency_ms && log.model) {
        const stats = latencyByModel.get(log.model) || { total: 0, count: 0 };
        stats.total += log.latency_ms;
        stats.count += 1;
        latencyByModel.set(log.model, stats);
      }
    });

    const categories = Array.from(usageByHour.keys()).reverse();
    const data = Array.from(usageByHour.values()).reverse();

    const latencyLabels = Array.from(latencyByModel.keys());
    const latencyValues = latencyLabels.map((m) => {
      const s = latencyByModel.get(m)!;
      return Math.round(s.total / s.count);
    });

    return {
      usage: { categories, data },
      latency: { labels: latencyLabels, data: latencyValues },
    };
  }

  getRecentLogs(limit = 100) {
    return this.databaseService.getRecentLogs(limit);
  }

  logRequest(
    apiKeyId: number | null,
    model: string,
    tokensInput: number,
    tokensOutput: number,
    latencyMs: number,
    status: string,
    errorMessage?: string,
  ) {
    this.databaseService.logRequest(
      apiKeyId,
      model,
      tokensInput,
      tokensOutput,
      latencyMs,
      status,
      errorMessage,
    );
  }
}
