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
  ): { key: string; id: number } {
    const rawKey = this.authService.generateApiKey();

    const result = this.databaseService.createApiKey(
      name,
      rawKey, // Store the key directly for simplicity
      dailyLimit,
      rateLimitPerMinute,
      smartContext,
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

  getApiKeyByKey(key: string): ApiKey | undefined {
    return this.databaseService.getApiKeyByKey(key) as ApiKey | undefined;
  }

  validateApiKey(key: string): { valid: boolean; keyData?: ApiKey } {
    const keyData = this.getApiKeyByKey(key);

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

  getStats() {
    return this.databaseService.getStatsForToday();
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
