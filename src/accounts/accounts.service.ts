import {
  Injectable,
  Logger,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { QuotaService } from '../quota/quota.service';
import { DatabaseService } from '../database/database.service';
import { EventsService } from '../events/events.service';
import {
  AccountCredential,
  AccountState,
  AccountStatusResponse,
  AccountPublicInfo,
} from './interfaces';

interface OAuthTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

interface LoadCodeAssistResponse {
  cloudaicompanionProject?: string;
  currentTier?: { id: string };
  allowedTiers?: Array<{ id: string; isDefault?: boolean }>;
}

interface OnboardUserResponse {
  done?: boolean;
  response?: { cloudaicompanionProject?: { id: string } };
}

@Injectable()
export class AccountsService implements OnModuleInit {
  private readonly logger = new Logger(AccountsService.name);
  private accountStatesMap = new Map<string, AccountState>();
  private accountsList: AccountState[] = [];
  private emailToIdMap = new Map<string, string>();
  private currentIndex = 0;
  private readonly TOKEN_URI = 'https://oauth2.googleapis.com/token';
  private readonly CODE_ASSIST_ENDPOINT =
    'https://cloudcode-pa.googleapis.com/v1internal';
  private readonly REFRESH_BUFFER_MS = 5 * 60 * 1000;
  private readonly COOLDOWN_DURATION_MS: number;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => QuotaService))
    private readonly quotaService: QuotaService,
    private readonly databaseService: DatabaseService,
    private readonly eventsService: EventsService,
  ) {
    this.COOLDOWN_DURATION_MS =
      this.configService.get<number>('accounts.cooldownDurationMs') || 60000;
    this.clientId =
      this.configService.get<string>('antigravity.clientId') || '';
    this.clientSecret =
      this.configService.get<string>('antigravity.clientSecret') || '';
  }

  onModuleInit() {
    this.loadAccounts();
  }

  public reloadAccounts(): void {
    this.accountStatesMap.clear();
    this.accountsList = [];
    this.emailToIdMap.clear();
    this.loadAccounts();
  }

  private loadAccounts(): void {
    // 1. Load all from DB
    const dbAccounts = this.databaseService.getAccounts() as any[];

    // 2. Initial Migration: If DB is empty, migrate from .env once
    if (dbAccounts.length === 0) {
      const envAccounts =
        this.configService.get<AccountCredential[]>('accounts.list') || [];
      if (envAccounts.length > 0) {
        this.logger.log(
          `Initial setup: Migrating ${envAccounts.length} accounts from .env to SQLite...`,
        );
        envAccounts.forEach((acc, index) => {
          const id = `account-${index + 1}`;
          this.databaseService.upsertAccount({
            id,
            email: acc.email,
            accessToken: acc.accessToken,
            refreshToken: acc.refreshToken,
            expiryDate: acc.expiryDate,
            projectId: acc.projectId,
          });
        });
        // Reload after migration
        this.loadAccounts();
        return;
      }
    }

    if (dbAccounts.length === 0) {
      this.logger.warn(
        'No accounts configured. Visit /oauth/authorize to add accounts.',
      );
      return;
    }

    dbAccounts.forEach((acc) => {
      const state: AccountState = {
        id: acc.id,
        credential: {
          email: acc.email,
          accessToken: acc.access_token,
          refreshToken: acc.refresh_token,
          expiryDate: acc.expiry_date,
          projectId: acc.project_id,
        },
        status: acc.status as any,
        requestCount: acc.request_count || 0,
        errorCount: acc.error_count || 0,
        consecutiveErrors: 0,
        lastUsed: acc.last_used_at
          ? new Date(acc.last_used_at).getTime()
          : undefined,
      };
      this.accountStatesMap.set(acc.id, state);
      this.accountsList.push(state);
      this.emailToIdMap.set(acc.email, acc.id);
    });

    this.logger.log(
      `Loaded ${this.accountStatesMap.size} account(s) from SQLite`,
    );
  }

  hasAccounts(): boolean {
    return this.accountStatesMap.size > 0;
  }

  getAccountCount(): number {
    return this.accountStatesMap.size;
  }

  getReadyAccounts(): AccountState[] {
    const now = Date.now();

    this.accountsList.forEach((state) => {
      if (
        state.status === 'cooldown' &&
        state.cooldownUntil &&
        state.cooldownUntil < now
      ) {
        state.status = 'ready';
        state.cooldownUntil = undefined;
        this.databaseService.updateAccountStatus(state.id, 'ready');
        this.logger.debug(
          `Account ${state.id} cooldown expired, marking as ready`,
        );
      }
    });

    return this.accountsList.filter((s) => s.status === 'ready');
  }

  deleteAccount(id: string): boolean {
    const result = this.databaseService.deleteAccount(id);
    if (result.changes > 0) {
      this.accountStatesMap.delete(id);
      const index = this.accountsList.findIndex((s) => s.id === id);
      if (index !== -1) {
        const email = this.accountsList[index].credential.email;
        this.accountsList.splice(index, 1);
        this.emailToIdMap.delete(email);
      }
      this.logger.log(`Deleted account ID: ${id}`);
      return true;
    }
    return false;
  }

  getNextAccount(modelName?: string): AccountState | null {
    const readyAccounts = this.getReadyAccounts();

    if (readyAccounts.length === 0) {
      return null;
    }

    const scoredAccounts = readyAccounts.map((state) => {
      let score = 0;

      if (modelName) {
        const quotaStatus = this.quotaService.getQuotaStatus([
          { id: state.id, email: state.credential.email },
        ]);
        const accountQuota = quotaStatus.accounts[0]?.models.find(
          (m) => m.modelName === modelName,
        );

        if (accountQuota) {
          score += accountQuota.quota * 1000;
          if (accountQuota.status === 'exhausted') {
            score -= 5000;
          }
        }
      }

      score -= state.requestCount * 0.1;

      if (state.lastUsed) {
        const secondsSinceLastUse = (Date.now() - state.lastUsed) / 1000;
        score += Math.min(secondsSinceLastUse, 3600);
      } else {
        score += 4000;
      }

      return { state, score };
    });

    scoredAccounts.sort((a, b) => b.score - a.score);
    const selected = scoredAccounts[0].state;
    this.currentIndex = this.accountsList.indexOf(selected);

    return selected;
  }

  getAccountById(accountId: string): AccountState | undefined {
    return this.accountStatesMap.get(accountId);
  }

  getAllAccountIds(): string[] {
    return Array.from(this.accountStatesMap.keys());
  }

  getAccountsForQuotaStatus(): Array<{ id: string; email: string }> {
    return this.accountsList.map((state) => ({
      id: state.id,
      email: state.credential.email,
    }));
  }

  markCooldown(accountId: string): void {
    const state = this.accountStatesMap.get(accountId);
    if (state) {
      state.status = 'cooldown';
      state.consecutiveErrors++;
      const backoffFactor = Math.pow(
        2,
        Math.min(state.consecutiveErrors - 1, 6),
      );
      state.cooldownUntil =
        Date.now() + this.COOLDOWN_DURATION_MS * backoffFactor;
      state.errorCount++;
      this.databaseService.updateAccountStatus(accountId, 'cooldown');
      this.logger.warn(
        `Account ${accountId} marked as cooldown until ${new Date(state.cooldownUntil).toISOString()}`,
      );
      this.eventsService.emitDashboardUpdate(this.getStatus());
    }
  }

  markError(accountId: string): void {
    const state = this.accountStatesMap.get(accountId);
    if (state) {
      state.status = 'error';
      state.errorCount++;
      this.databaseService.updateAccountStatus(accountId, 'error');
      this.logger.error(
        `Account ${accountId} (${state.credential.email}) marked as error`,
      );
      this.eventsService.emitDashboardUpdate(this.getStatus());
    }
  }

  markSuccess(accountId: string): void {
    const state = this.accountStatesMap.get(accountId);
    if (state) {
      state.requestCount++;
      state.lastUsed = Date.now();
      state.consecutiveErrors = 0;
      if (state.status === 'error' || state.status === 'cooldown') {
        state.status = 'ready';
        state.cooldownUntil = undefined;
      }
      this.databaseService.updateAccountStatus(accountId, 'ready');
      this.databaseService.incrementAccountUsage(accountId, false);
      this.eventsService.emitDashboardUpdate(this.getStatus());
    }
  }

  addAccount(credential: AccountCredential): {
    id: string;
    accountNumber: number;
    isNew: boolean;
  } {
    const existingId = this.emailToIdMap.get(credential.email);

    if (existingId) {
      const existing = this.accountStatesMap.get(existingId)!;
      existing.credential.accessToken = credential.accessToken;
      existing.credential.refreshToken = credential.refreshToken;
      existing.credential.expiryDate = credential.expiryDate;
      existing.status = 'ready';
      existing.errorCount = 0;

      this.databaseService.upsertAccount({
        id: existing.id,
        email: credential.email,
        accessToken: credential.accessToken,
        refreshToken: credential.refreshToken,
        expiryDate: credential.expiryDate,
        projectId: existing.credential.projectId,
      });

      const accountNumber =
        this.accountsList.findIndex((s) => s.id === existingId) + 1;
      return { id: existing.id, accountNumber, isNew: false };
    }

    // Encontra o próximo número sequencial disponível
    const existingNums = this.accountsList
      .map((s) => {
        const match = s.id.match(/^account-(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => n > 0);

    const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
    const id = `account-${nextNum}`;
    const newState: AccountState = {
      id,
      credential,
      status: 'ready',
      requestCount: 0,
      errorCount: 0,
      consecutiveErrors: 0,
    };

    this.accountStatesMap.set(id, newState);
    this.accountsList.push(newState);
    this.emailToIdMap.set(credential.email, id);

    this.databaseService.upsertAccount({
      id,
      email: credential.email,
      accessToken: credential.accessToken,
      refreshToken: credential.refreshToken,
      expiryDate: credential.expiryDate,
    });

    return { id, accountNumber: this.accountsList.length, isNew: true };
  }

  getStatus(): AccountStatusResponse {
    const accounts: AccountPublicInfo[] = this.accountsList.map(
      (state, index) => {
        return {
          id: state.id,
          email: state.credential.email,
          status: state.status,
          cooldownUntil: state.cooldownUntil,
          lastUsed: state.lastUsed,
          requestCount: state.requestCount,
          errorCount: state.errorCount,
          consecutiveErrors: state.consecutiveErrors,
          envText: `SQLite Persisted`,
        };
      },
    );

    return {
      totalAccounts: this.accountStatesMap.size,
      readyAccounts: this.accountsList.filter((s) => s.status === 'ready')
        .length,
      cooldownAccounts: this.accountsList.filter((s) => s.status === 'cooldown')
        .length,
      errorAccounts: this.accountsList.filter((s) => s.status === 'error')
        .length,
      currentIndex: this.currentIndex,
      accounts,
    };
  }

  getAccountForExport(id: string): AccountCredential | null {
    const state = this.accountStatesMap.get(id);
    if (!state) return null;
    return state.credential;
  }

  getEarliestCooldownEnd(): number | null {
    const cooldownAccounts = this.accountsList.filter(
      (s) => s.status === 'cooldown' && s.cooldownUntil,
    );
    if (cooldownAccounts.length === 0) return null;
    return Math.min(...cooldownAccounts.map((s) => s.cooldownUntil!));
  }

  isTokenExpired(state: AccountState): boolean {
    return Date.now() + this.REFRESH_BUFFER_MS >= state.credential.expiryDate;
  }

  async getAccessToken(state: AccountState): Promise<string> {
    // Reload from DB to ensure we have the latest token (refreshed by Admin instance)
    const allDb = this.databaseService.getAccounts() as any[];
    const dbAcc = allDb.find((a) => a.id === state.id);
    if (dbAcc) {
      state.credential.accessToken = dbAcc.access_token;
      state.credential.refreshToken = dbAcc.refresh_token;
      state.credential.expiryDate = dbAcc.expiry_date;
      state.credential.projectId = dbAcc.project_id;
      state.status = dbAcc.status as any;
      state.requestCount = dbAcc.request_count || 0;
      state.errorCount = dbAcc.error_count || 0;
    }

    if (this.isTokenExpired(state)) {
      await this.refreshToken(state);
    }
    return state.credential.accessToken;
  }

  async refreshToken(state: AccountState): Promise<void> {
    try {
      const response = await axios.post<OAuthTokenResponse>(
        this.TOKEN_URI,
        {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: state.credential.refreshToken,
          grant_type: 'refresh_token',
        },
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          transformRequest: [
            (data: Record<string, string>) =>
              new URLSearchParams(data).toString(),
          ],
        },
      );

      state.credential.accessToken = response.data.access_token;
      state.credential.expiryDate =
        Date.now() + response.data.expires_in * 1000;

      if (response.data.refresh_token) {
        state.credential.refreshToken = response.data.refresh_token;
      }

      this.databaseService.upsertAccount({
        id: state.id,
        email: state.credential.email,
        accessToken: state.credential.accessToken,
        refreshToken: state.credential.refreshToken,
        expiryDate: state.credential.expiryDate,
        projectId: state.credential.projectId,
      });

      this.logger.debug(`Refreshed token for account ${state.id}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to refresh token for account ${state.id}: ${errorMessage}`,
      );
      this.markError(state.id);
      throw new Error(`Token refresh failed: ${errorMessage}`);
    }
  }

  async getAuthHeaders(state: AccountState): Promise<Record<string, string>> {
    const token = await this.getAccessToken(state);
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  async getProjectId(state: AccountState): Promise<string> {
    if (state.credential.projectId) {
      return state.credential.projectId;
    }
    if (state.discoveredProjectId) {
      return state.discoveredProjectId;
    }
    state.discoveredProjectId = await this.discoverProjectId(state);
    return state.discoveredProjectId;
  }

  private async discoverProjectId(state: AccountState): Promise<string> {
    const token = await this.getAccessToken(state);
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    try {
      const loadResponse = await axios.post<LoadCodeAssistResponse>(
        `${this.CODE_ASSIST_ENDPOINT}:loadCodeAssist`,
        {
          cloudaicompanionProject: null,
          metadata: {
            ideType: 'IDE_UNSPECIFIED',
            platform: 'PLATFORM_UNSPECIFIED',
            pluginType: 'GEMINI',
          },
        },
        { headers, timeout: 20000 },
      );
      const serverProject = loadResponse.data.cloudaicompanionProject;
      if (serverProject) {
        this.databaseService.upsertAccount({
          ...state.credential,
          id: state.id,
          projectId: serverProject,
        });
        return serverProject;
      }
      return this.generateFakeProjectId();
    } catch {
      return this.generateFakeProjectId();
    }
  }

  private async onboardUser(
    tierId: string,
    headers: Record<string, string>,
  ): Promise<string | null> {
    for (let i = 0; i < 60; i++) {
      const response = await axios.post<OnboardUserResponse>(
        `${this.CODE_ASSIST_ENDPOINT}:onboardUser`,
        {
          tierId,
          cloudaicompanionProject: null,
          metadata: {
            ideType: 'IDE_UNSPECIFIED',
            platform: 'PLATFORM_UNSPECIFIED',
            pluginType: 'GEMINI',
          },
        },
        { headers, timeout: 30000 },
      );
      if (response.data.done)
        return response.data.response?.cloudaicompanionProject?.id || null;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return null;
  }

  private generateFakeProjectId(): string {
    return `antigravity-project-${Math.random().toString(16).substring(2, 7)}`;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleTokenRefreshCron() {
    this.logger.debug('Running background token refresh check...');
    const now = Date.now();
    const tenMinutesInMs = 10 * 60 * 1000;

    for (const state of this.accountsList) {
      const needsRefresh = now + tenMinutesInMs >= state.credential.expiryDate;
      if (needsRefresh) {
        this.logger.log(
          `Background refresh: Account ${state.credential.email} is expiring soon. Refreshing...`,
        );
        try {
          await this.refreshToken(state);
          this.logger.log(
            `Successfully refreshed token for ${state.credential.email} in background.`,
          );
        } catch (error) {
          this.logger.error(
            `Failed background refresh for ${state.credential.email}: ${error.message}`,
          );
        }
      }
    }
  }
}
