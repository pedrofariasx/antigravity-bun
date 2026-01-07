import axios from 'axios';
import { config } from '../config/configuration';
import {
  QuotaCacheEntry,
  FetchAvailableModelsResponse,
  QuotaStatusResponse,
  AccountQuotaStatus,
  ModelQuotaStatus,
  GroupedQuotaStatus,
  QuotaGroup,
} from './interfaces';
import { AccountState } from '../accounts/interfaces';
import {
  BASE_URLS,
  USER_AGENT,
  QUOTA_GROUPS,
  GROUP_DISPLAY_NAMES,
} from '../antigravity/constants';
import { eventsService } from '../events/events.service';
import { accountsService } from '../accounts/accounts.service';

export class QuotaService {
  private readonly quotaCache = new Map<string, Map<string, QuotaCacheEntry>>();
  private readonly quotaThreshold: number;

  constructor() {
    this.quotaThreshold = config.accounts.maxRetryAccounts ? 0.01 : 0.01; // Simplificado
  }

  async fetchQuotaFromUpstream(
    accountState: AccountState,
    accessToken: string,
    projectId?: string,
  ): Promise<void> {
    const endpoint = ':fetchAvailableModels';

    for (const baseUrl of BASE_URLS) {
      const url = `${baseUrl}${endpoint}`;

      try {
        console.debug(
          `[Quota] Fetching quota from ${url} for account ${accountState.id}`,
        );

        const response = await axios.post<FetchAvailableModelsResponse>(
          url,
          { project: projectId || '' },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'User-Agent': USER_AGENT,
            },
            timeout: 30000,
          },
        );

        if (response.data?.models) {
          this.updateQuotasFromModels(accountState.id, response.data.models);
          console.log(
            `[Quota] Updated quotas for account ${accountState.id}: ${Object.keys(response.data.models).length} models`,
          );
          return;
        }
      } catch (error: any) {
        const errorMessage = error.message;
        console.warn(
          `[Quota] Failed to fetch quota from ${baseUrl}: ${errorMessage}`,
        );
        continue;
      }
    }

    console.error(
      `[Quota] Failed to fetch quota from all endpoints for account ${accountState.id}`,
    );
  }

  private updateQuotasFromModels(
    accountId: string,
    models: FetchAvailableModelsResponse['models'],
  ): void {
    let accountCache = this.quotaCache.get(accountId);
    if (!accountCache) {
      accountCache = new Map();
      this.quotaCache.set(accountId, accountCache);
    }

    for (const [modelName, modelInfo] of Object.entries(models)) {
      if (modelInfo.quotaInfo) {
        const quota = modelInfo.quotaInfo.remainingFraction ?? 1.0;
        const resetTime = modelInfo.quotaInfo.resetTime
          ? new Date(modelInfo.quotaInfo.resetTime)
          : undefined;

        accountCache.set(modelName, {
          quota,
          resetTime,
          lastFetchedAt: new Date(),
        });
      }
    }

    // Mirroring specific models
    const highQuota = accountCache.get('gemini-3-pro-high');
    if (highQuota) accountCache.set('gemini-3-pro-preview', { ...highQuota });

    const flashQuota = accountCache.get('gemini-3-flash');
    if (flashQuota)
      accountCache.set('gemini-3-pro-flash-preview', { ...flashQuota });

    this.emitQuotaUpdate();
  }

  private emitQuotaUpdate(): void {
    try {
      const status = accountsService.getStatus();
      const quotaAccounts = accountsService.getAccountsForQuotaStatus();
      const quotaStatus = this.getQuotaStatus(quotaAccounts);

      eventsService.emitDashboardUpdate({
        status,
        quotaStatus,
      });
    } catch (error) {
      console.error('[Quota] Failed to emit quota update:', error);
    }
  }

  getQuotaStatus(
    accounts: Array<{ id: string; email: string }>,
  ): QuotaStatusResponse {
    const accountStatuses: AccountQuotaStatus[] = accounts.map((account) => {
      const accountCache = this.quotaCache.get(account.id);
      const models: ModelQuotaStatus[] = [];

      if (accountCache) {
        for (const [modelName, entry] of accountCache.entries()) {
          models.push({
            modelName,
            quota: entry.quota,
            resetTime: entry.resetTime?.toISOString(),
            status:
              entry.quota > this.quotaThreshold ? 'available' : 'exhausted',
          });
        }
      }

      const lastFetched =
        accountCache && accountCache.size > 0
          ? Array.from(accountCache.values()).reduce(
              (latest, entry) =>
                entry.lastFetchedAt > latest ? entry.lastFetchedAt : latest,
              new Date(0),
            )
          : undefined;

      return {
        accountId: account.id,
        email: account.email,
        models: models.sort((a, b) => a.modelName.localeCompare(b.modelName)),
        lastFetchedAt: lastFetched?.toISOString(),
      };
    });

    const groupedQuota = this.calculateGroupedQuota(accountStatuses);

    return {
      totalAccounts: accounts.length,
      accounts: accountStatuses,
      groupedQuota,
    };
  }

  private calculateGroupedQuota(
    accounts: AccountQuotaStatus[],
  ): GroupedQuotaStatus {
    const groups: QuotaGroup[] = [];

    for (const [groupName, modelNames] of Object.entries(QUOTA_GROUPS)) {
      const quotas: number[] = [];

      for (const account of accounts) {
        for (const model of account.models) {
          if (modelNames.includes(model.modelName)) {
            quotas.push(model.quota);
          }
        }
      }

      const totalQuota = quotas.reduce((sum, q) => sum + q, 0);
      const averageQuota = quotas.length > 0 ? totalQuota / quotas.length : 0;

      let status: QuotaGroup['status'] = 'available';
      if (averageQuota <= this.quotaThreshold) {
        status = 'exhausted';
      } else if (averageQuota < 0.3) {
        status = 'limited';
      }

      groups.push({
        name: groupName,
        displayName: GROUP_DISPLAY_NAMES[groupName] || groupName,
        models: modelNames,
        totalQuota,
        averageQuota,
        status,
      });
    }

    return { groups };
  }
}

export const quotaService = new QuotaService();
