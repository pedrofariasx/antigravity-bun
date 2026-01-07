import { databaseService } from '../database/database.service';
import { authService } from '../auth/auth.service';

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

export class ApiKeysService {
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
    const rawKey = authService.generateApiKey();
    const hashedKey = authService.hashApiKey(rawKey);

    const result = databaseService.createApiKey(
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

    console.log(`[ApiKeys] Created new API key: ${name}`);

    return {
      key: rawKey,
      id: result.lastInsertRowid as number,
    };
  }

  getAllApiKeys(): ApiKey[] {
    return databaseService.getAllApiKeys() as ApiKey[];
  }

  getApiKeyByRawKey(rawKey: string): ApiKey | undefined {
    const hash = authService.hashApiKey(rawKey);
    return databaseService.getApiKeyByHash(hash) as ApiKey | undefined;
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
    databaseService.updateApiKeyUsage(keyId, tokensUsed);
  }

  deactivateApiKey(keyId: number): boolean {
    const result = databaseService.deactivateApiKey(keyId);
    console.log(`[ApiKeys] Deactivated API key ID: ${keyId}`);
    return result.changes > 0;
  }

  activateApiKey(keyId: number): boolean {
    const result = databaseService.activateApiKey(keyId);
    console.log(`[ApiKeys] Activated API key ID: ${keyId}`);
    return result.changes > 0;
  }

  deleteApiKey(keyId: number): boolean {
    const result = databaseService.deleteApiKey(keyId);
    console.log(`[ApiKeys] Deleted API key ID: ${keyId}`);
    return result.changes > 0;
  }

  toggleSmartContext(keyId: number, enabled: boolean): boolean {
    const result = databaseService.updateApiKeySmartContext(
      keyId,
      enabled ? 1 : 0,
    );
    console.log(
      `[ApiKeys] Smart Context ${enabled ? 'enabled' : 'disabled'} for API key ID: ${keyId}`,
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
    const result = databaseService.updateApiKey(keyId, data);
    console.log(`[ApiKeys] Updated API key ID: ${keyId}`);
    return result.changes > 0;
  }

  getStats() {
    return databaseService.getStatsForToday();
  }

  getAnalyticsData() {
    const logs = databaseService.getRecentLogs(1000); // Increased limit for better resolution

    // Initialize hours (categories)
    const hours: string[] = [];
    const now = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(now);
      d.setHours(now.getHours() - i);
      const hourStr = d.getHours().toString().padStart(2, '0') + ':00';
      hours.push(hourStr);
    }
    hours.reverse(); // Chronological order

    // Initialize model series
    const usageByModel = new Map<string, number[]>();
    const latencyByModel = new Map<string, { total: number; count: number }>();

    (logs as any[]).forEach((log) => {
      // 1. Process Usage
      const date = new Date(log.created_at);
      const hourStr = date.getHours().toString().padStart(2, '0') + ':00';
      const tokens = (log.tokens_input || 0) + (log.tokens_output || 0);
      const model = log.model || 'unknown';

      // Find time slot index
      const hourIndex = hours.indexOf(hourStr);

      if (hourIndex !== -1) {
        if (!usageByModel.has(model)) {
          usageByModel.set(model, Array(24).fill(0));
        }
        const series = usageByModel.get(model)!;
        series[hourIndex] += tokens;
      }

      // 2. Process Latency
      if (log.latency_ms && log.model) {
        const stats = latencyByModel.get(log.model) || { total: 0, count: 0 };
        stats.total += log.latency_ms;
        stats.count += 1;
        latencyByModel.set(log.model, stats);
      }
    });

    // Format usage series for ApexCharts
    const series = Array.from(usageByModel.entries()).map(([name, data]) => ({
      name,
      data,
    }));

    // If no data, return at least one empty series
    if (series.length === 0) {
      series.push({ name: 'No Data', data: Array(24).fill(0) });
    }

    const latencyLabels = Array.from(latencyByModel.keys());
    const latencyValues = latencyLabels.map((m) => {
      const s = latencyByModel.get(m)!;
      return Math.round(s.total / s.count);
    });

    return {
      usage: { categories: hours, series },
      latency: { labels: latencyLabels, data: latencyValues },
    };
  }

  getRecentLogs(limit = 100) {
    return databaseService.getRecentLogs(limit);
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
    databaseService.logRequest(
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

export const apiKeysService = new ApiKeysService();
