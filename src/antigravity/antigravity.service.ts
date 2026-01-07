import axios, { AxiosError, AxiosResponse } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';
import { config } from '../config/configuration';
import { accountsService } from '../accounts/accounts.service';
import { AccountState } from '../accounts/interfaces';
import { transformerService } from './services/transformer.service';
import { anthropicTransformerService } from './services/anthropic-transformer.service';
import { quotaService } from '../quota/quota.service';
import { ChatCompletionRequestDto } from './dto';
import { ChatCompletionResponse, ModelsResponse } from './dto';
import { AnthropicMessagesRequestDto } from './dto/anthropic-messages-request.dto';
import { AnthropicMessagesResponse } from './dto/anthropic-messages-response.dto';
import {
  AntigravityResponse,
  AntigravityStreamChunk,
  AntigravityError,
} from './interfaces';
import {
  BASE_URLS,
  AVAILABLE_MODELS,
  MODEL_OWNERS,
  USER_AGENT,
} from './constants';
import { SSEStreamParser } from '../common/utils';
import { QuotaStatusResponse } from '../quota/interfaces';
import { apiKeysService } from '../api-keys/api-keys.service';
import { antigravityClientService } from './services/antigravity-client.service';
import { eventsService } from '../events/events.service';

type ApiType = 'openai' | 'anthropic';

export class AntigravityService {
  private readonly maxRetryAccounts: number;

  constructor() {
    this.maxRetryAccounts = config.accounts.maxRetryAccounts || 3;
  }

  private checkAccountsExist(): void {
    if (!accountsService.hasAccounts()) {
      throw new Error(
        'No accounts configured. Visit /oauth/authorize to add accounts.',
      );
    }
  }

  private createRateLimitError(apiType: ApiType, retryAfter?: number): any {
    const status = 429;
    if (apiType === 'anthropic') {
      return {
        status,
        body: {
          type: 'error',
          error: {
            type: 'rate_limit_error',
            message: retryAfter
              ? `All accounts are rate limited. Retry after ${retryAfter} seconds.`
              : 'All accounts are rate limited. Please try again later.',
          },
        },
      };
    }

    return {
      status,
      body: {
        error: {
          message: retryAfter
            ? `All accounts are rate limited. Retry after ${retryAfter} seconds.`
            : 'All retry attempts exhausted due to rate limiting.',
          type: 'rate_limit_error',
          param: null,
          code: 'rate_limit_exceeded',
        },
      },
    };
  }

  private getRetryAfterSeconds(): number {
    const earliestCooldown = accountsService.getEarliestCooldownEnd();
    return earliestCooldown
      ? Math.ceil((earliestCooldown - Date.now()) / 1000)
      : 60;
  }

  private async withAccountRetry<T>(
    operation: (accountState: AccountState) => Promise<T>,
    apiType: ApiType,
    setHeaders?: (name: string, value: string) => void,
    forcedAccountId?: string,
    modelName?: string,
  ): Promise<T> {
    const maxAttempts = Math.min(
      this.maxRetryAccounts,
      accountsService.getAccountCount(),
    );

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const accountState =
        forcedAccountId && attempt === 0
          ? accountsService.getAccountById(forcedAccountId)
          : accountsService.getNextAccount(modelName);

      if (!accountState) {
        const retryAfter = this.getRetryAfterSeconds();
        if (setHeaders) {
          setHeaders('Retry-After', String(retryAfter));
        }
        const error = this.createRateLimitError(apiType, retryAfter);
        throw error;
      }

      try {
        return await operation(accountState);
      } catch (error: any) {
        if (this.isRateLimitError(error) || this.isQuotaExceededError(error)) {
          accountsService.markCooldown(accountState.id);
          console.warn(
            `[Antigravity] Rate limit or quota exceeded on account ${accountState.id} (${accountState.credential.email}), trying next account...`,
          );
          continue;
        }
        throw error;
      }
    }

    throw this.createRateLimitError(apiType);
  }

  private async createStreamRequest(
    data: unknown,
    accountState: AccountState,
  ): Promise<Readable> {
    const authHeaders = await accountsService.getAuthHeaders(accountState);
    const endpoint = ':streamGenerateContent?alt=sse';
    const baseUrl = antigravityClientService.getBaseUrl();
    const host = new URL(baseUrl).host;

    const response: AxiosResponse<Readable> = await axios.post(
      `${baseUrl}${endpoint}`,
      data,
      {
        headers: {
          ...authHeaders,
          Host: host,
          Accept: 'text/event-stream',
          'User-Agent': USER_AGENT,
        },
        responseType: 'stream',
      },
    );

    return response.data;
  }

  private async processStream(
    stream: Readable,
    write: (data: string) => void,
    end: () => void,
    handlers: {
      onData: (data: string) => void;
      onEnd: () => void;
      onError: (error: Error) => void;
      parser: SSEStreamParser;
    },
  ): Promise<void> {
    const { onData, onEnd, onError, parser } = handlers;

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        const dataLines = parser.parseChunk(chunk);
        for (const data of dataLines) {
          try {
            onData(data);
          } catch {
            console.warn(`[Antigravity] Failed to parse chunk: ${data}`);
          }
        }
      });

      stream.on('end', () => {
        onEnd();
        end();
        resolve();
      });

      stream.on('error', (error: Error) => {
        console.error(`[Antigravity] Stream error: ${error.message}`);
        onError(error);
        end();
        reject(error);
      });
    });
  }

  async chatCompletion(
    dto: ChatCompletionRequestDto,
    forcedAccountId?: string,
    apiKeyData?: any,
  ): Promise<ChatCompletionResponse> {
    this.checkAccountsExist();
    const requestId = `chatcmpl-${uuidv4()}`;
    const startTime = Date.now();

    try {
      const response = await this.withAccountRetry(
        async (accountState) => {
          const projectId = await accountsService.getProjectId(accountState);

          if (apiKeyData?.smart_context === 1) {
            dto.messages = transformerService.pruneMessages(dto.messages);
            console.debug(
              `[Antigravity] Smart Context active for API Key ${apiKeyData.name}: pruned to ${dto.messages.length} messages`,
            );
          }

          const antigravityRequest = transformerService.transformRequest(
            dto,
            projectId,
          );

          console.debug(
            `[Antigravity] Chat completion: model=${dto.model}, account=${accountState.id} (${accountState.credential.email}), messages=${dto.messages.length}`,
          );

          const response = await this.makeRequest<AntigravityResponse>(
            ':generateContent',
            antigravityRequest,
            accountState,
          );

          accountsService.markSuccess(accountState.id);

          return transformerService.transformResponse(
            response,
            dto.model,
            requestId,
          );
        },
        'openai',
        undefined,
        forcedAccountId,
        dto.model,
      );

      const latency = Date.now() - startTime;
      const tokens = response.usage?.total_tokens || 0;

      if (apiKeyData) {
        apiKeysService.updateUsage(apiKeyData.id, tokens);
      }

      const promptTokens = response.usage?.prompt_tokens || 0;
      const completionTokens = response.usage?.completion_tokens || 0;

      apiKeysService.logRequest(
        apiKeyData?.id || null,
        dto.model,
        promptTokens,
        completionTokens,
        latency,
        'success',
      );

      eventsService.emitAnalyticsNewRequest({
        model: dto.model,
        tokens: promptTokens + completionTokens,
        latency,
        status: 'success',
        timestamp: new Date().toISOString(),
      });

      return response;
    } catch (error: any) {
      const latency = Date.now() - startTime;
      apiKeysService.logRequest(
        apiKeyData?.id || null,
        dto.model,
        0,
        0,
        latency,
        'error',
        error.message,
      );

      eventsService.emitAnalyticsNewRequest({
        model: dto.model,
        tokens: 0,
        latency,
        status: 'error',
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  async chatCompletionStream(
    dto: ChatCompletionRequestDto,
    write: (data: string) => void,
    end: () => void,
    setHeaders: (name: string, value: string) => void,
    forcedAccountId?: string,
    apiKeyData?: any,
  ): Promise<void> {
    this.checkAccountsExist();
    const requestId = `chatcmpl-${uuidv4()}`;
    const startTime = Date.now();

    await this.withAccountRetry(
      async (accountState) => {
        const projectId = await accountsService.getProjectId(accountState);

        if (apiKeyData?.smart_context === 1) {
          dto.messages = transformerService.pruneMessages(dto.messages);
        }

        const antigravityRequest = transformerService.transformRequest(
          dto,
          projectId,
        );

        setHeaders('Content-Type', 'text/event-stream');
        setHeaders('Cache-Control', 'no-cache');
        setHeaders('Connection', 'keep-alive');
        setHeaders('X-Accel-Buffering', 'no');

        const stream = await this.createStreamRequest(
          antigravityRequest,
          accountState,
        );
        accountsService.markSuccess(accountState.id);

        const parser = new SSEStreamParser();
        let isFirst = true;
        const accumulator = transformerService.createStreamAccumulator();

        await this.processStream(stream, write, end, {
          onData: (data) => {
            const parsed = JSON.parse(data) as AntigravityStreamChunk;
            const transformed = transformerService.transformStreamChunk(
              parsed,
              dto.model,
              requestId,
              isFirst,
              accumulator,
            );

            if (transformed) {
              write(`data: ${JSON.stringify(transformed)}\n\n`);
              isFirst = false;
            }
          },
          onEnd: () => {
            if (!accumulator.isComplete) {
              const finalChunk = transformerService.createFinalChunk(
                requestId,
                dto.model,
                accumulator,
              );
              write(`data: ${JSON.stringify(finalChunk)}\n\n`);
            }
            write('data: [DONE]\n\n');
          },
          onError: (error) => {
            write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
          },
          parser,
        });

        const latency = Date.now() - startTime;
        const promptTokens = accumulator.usage?.prompt_tokens || 0;
        const completionTokens = accumulator.usage?.completion_tokens || 0;
        const totalTokens = promptTokens + completionTokens;

        if (apiKeyData) {
          apiKeysService.updateUsage(apiKeyData.id, totalTokens);
        }

        apiKeysService.logRequest(
          apiKeyData?.id || null,
          dto.model,
          promptTokens,
          completionTokens,
          latency,
          'success',
        );

        eventsService.emitAnalyticsNewRequest({
          model: dto.model,
          tokens: totalTokens,
          latency,
          status: 'success',
          timestamp: new Date().toISOString(),
        });
      },
      'openai',
      setHeaders,
      forcedAccountId,
      dto.model,
    ).catch(async (error) => {
      const latency = Date.now() - startTime;
      apiKeysService.logRequest(
        apiKeyData?.id || null,
        dto.model,
        0,
        0,
        latency,
        'error',
        error.message,
      );
      throw error;
    });
  }

  listModels(): ModelsResponse {
    const now = Math.floor(Date.now() / 1000);

    return {
      object: 'list',
      data: AVAILABLE_MODELS.map((id) => ({
        id,
        object: 'model' as const,
        created: now,
        owned_by: MODEL_OWNERS[id] || 'unknown',
      })),
    };
  }

  async getQuotaStatus(): Promise<QuotaStatusResponse> {
    const readyAccounts = accountsService.getReadyAccounts();

    await Promise.allSettled(
      readyAccounts.map((account) => this.refreshAccountQuota(account)),
    );

    const accounts = accountsService.getAccountsForQuotaStatus();
    return quotaService.getQuotaStatus(accounts);
  }

  private async refreshAccountQuota(accountState: AccountState): Promise<void> {
    try {
      const accessToken = await accountsService.getAccessToken(accountState);
      const projectId = await accountsService.getProjectId(accountState);
      await quotaService.fetchQuotaFromUpstream(
        accountState,
        accessToken,
        projectId,
      );
    } catch (error: any) {
      console.warn(
        `[Antigravity] Failed to refresh quota for account ${accountState.id}: ${error.message}`,
      );
    }
  }

  async anthropicMessages(
    dto: AnthropicMessagesRequestDto,
    messageId: string,
    forcedAccountId?: string,
    apiKeyData?: any,
  ): Promise<AnthropicMessagesResponse> {
    this.checkAccountsExist();
    const startTime = Date.now();

    try {
      const response = await this.withAccountRetry(
        async (accountState) => {
          const projectId = await accountsService.getProjectId(accountState);

          if (apiKeyData?.smart_context === 1) {
            dto.messages = transformerService.pruneMessages(dto.messages);
          }

          const antigravityRequest =
            anthropicTransformerService.transformRequest(dto, projectId);

          const response = await this.makeRequest<AntigravityResponse>(
            ':generateContent',
            antigravityRequest,
            accountState,
          );

          accountsService.markSuccess(accountState.id);

          return anthropicTransformerService.transformResponse(
            response,
            dto.model,
            messageId,
          );
        },
        'anthropic',
        undefined,
        forcedAccountId,
        dto.model,
      );

      const latency = Date.now() - startTime;
      const inputTokens = response.usage?.input_tokens || 0;
      const output_tokens = response.usage?.output_tokens || 0;
      const totalTokens = inputTokens + output_tokens;

      if (apiKeyData) {
        apiKeysService.updateUsage(apiKeyData.id, totalTokens);
      }

      apiKeysService.logRequest(
        apiKeyData?.id || null,
        dto.model,
        inputTokens,
        output_tokens,
        latency,
        'success',
      );

      eventsService.emitAnalyticsNewRequest({
        model: dto.model,
        tokens: totalTokens,
        latency,
        status: 'success',
        timestamp: new Date().toISOString(),
      });

      return response;
    } catch (error: any) {
      const latency = Date.now() - startTime;
      apiKeysService.logRequest(
        apiKeyData?.id || null,
        dto.model,
        0,
        0,
        latency,
        'error',
        error.message,
      );
      throw error;
    }
  }

  async anthropicMessagesStream(
    dto: AnthropicMessagesRequestDto,
    write: (data: string) => void,
    end: () => void,
    setHeaders: (name: string, value: string) => void,
    messageId: string,
    forcedAccountId?: string,
    apiKeyData?: any,
  ): Promise<void> {
    this.checkAccountsExist();
    const startTime = Date.now();

    await this.withAccountRetry(
      async (accountState) => {
        const projectId = await accountsService.getProjectId(accountState);

        if (apiKeyData?.smart_context === 1) {
          dto.messages = transformerService.pruneMessages(dto.messages);
        }

        const antigravityRequest = anthropicTransformerService.transformRequest(
          dto,
          projectId,
        );

        setHeaders('Content-Type', 'text/event-stream');
        setHeaders('Cache-Control', 'no-cache');
        setHeaders('Connection', 'keep-alive');

        const stream = await this.createStreamRequest(
          antigravityRequest,
          accountState,
        );
        accountsService.markSuccess(accountState.id);

        const parser = new SSEStreamParser();
        let isFirst = true;
        const accumulator = anthropicTransformerService.createStreamAccumulator(
          messageId,
          dto.model,
        );

        await this.processStream(stream, write, end, {
          onData: (data) => {
            const parsed = JSON.parse(data) as AntigravityStreamChunk;
            const events = anthropicTransformerService.transformStreamChunk(
              parsed,
              accumulator,
              isFirst,
            );

            for (const event of events) {
              write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
            }

            if (events.length > 0) {
              isFirst = false;
            }
          },
          onEnd: () => {
            const finalEvents =
              anthropicTransformerService.createFinalEvents(accumulator);
            for (const event of finalEvents) {
              write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
            }
          },
          onError: (error) => {
            const errorEvent = {
              type: 'error',
              error: { type: 'api_error', message: error.message },
            };
            write(`event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`);
          },
          parser,
        });

        const latency = Date.now() - startTime;
        const inputTokens = accumulator.usage?.input_tokens || 0;
        const outputTokens = accumulator.usage?.output_tokens || 0;
        const totalTokens = inputTokens + outputTokens;

        if (apiKeyData) {
          apiKeysService.updateUsage(apiKeyData.id, totalTokens);
        }

        apiKeysService.logRequest(
          apiKeyData?.id || null,
          dto.model,
          inputTokens,
          outputTokens,
          latency,
          'success',
        );

        eventsService.emitAnalyticsNewRequest({
          model: dto.model,
          tokens: totalTokens,
          latency,
          status: 'success',
          timestamp: new Date().toISOString(),
        });
      },
      'anthropic',
      setHeaders,
      forcedAccountId,
      dto.model,
    ).catch(async (error) => {
      throw error;
    });
  }

  private isRateLimitError(error: unknown): boolean {
    if (axios.isAxiosError(error)) {
      return error.response?.status === 429;
    }
    return (error as any)?.status === 429;
  }

  private isQuotaExceededError(error: unknown): boolean {
    if (axios.isAxiosError(error)) {
      return error.response?.status === 403;
    }
    return (error as any)?.status === 403;
  }

  private async makeRequest<T>(
    endpoint: string,
    data: unknown,
    accountState: AccountState,
  ): Promise<T> {
    try {
      const headers = await accountsService.getAuthHeaders(accountState);
      return await antigravityClientService.makeRequest<T>(
        endpoint,
        data,
        headers,
      );
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          try {
            await accountsService.refreshToken(accountState);
            const newHeaders =
              await accountsService.getAuthHeaders(accountState);
            return await antigravityClientService.makeRequest<T>(
              endpoint,
              data,
              newHeaders,
            );
          } catch {
            throw { status: 401, body: { message: 'Authentication failed' } };
          }
        }
      }
      throw error;
    }
  }
}

export const antigravityService = new AntigravityService();
