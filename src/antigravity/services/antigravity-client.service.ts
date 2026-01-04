import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { BASE_URLS, USER_AGENT } from '../constants';
import { AccountState } from '../../accounts/interfaces';
import { AntigravityError } from '../interfaces';

@Injectable()
export class AntigravityClientService {
  private readonly logger = new Logger(AntigravityClientService.name);
  private currentBaseUrlIndex = 0;

  async makeRequest<T>(
    endpoint: string,
    data: unknown,
    headers: Record<string, string>,
  ): Promise<T> {
    for (let i = 0; i < BASE_URLS.length; i++) {
      const baseUrl =
        BASE_URLS[(this.currentBaseUrlIndex + i) % BASE_URLS.length];
      const url = `${baseUrl}${endpoint}`;

      try {
        this.logger.debug(`Making request to: ${url}`);

        const response = await axios.post<T>(url, data, {
          headers: {
            ...headers,
            'User-Agent': USER_AGENT,
          },
          timeout: 120000,
        });

        return response.data;
      } catch (error) {
        const axiosError = error as AxiosError<AntigravityError>;

        if (
          axiosError.response?.status === 429 ||
          axiosError.response?.status === 401
        ) {
          throw error; // Rethrow to let the caller handle rotation or refresh
        }

        this.logger.warn(`Request to ${baseUrl} failed: ${axiosError.message}`);
        if (i === BASE_URLS.length - 1) {
          throw error;
        }

        this.currentBaseUrlIndex =
          (this.currentBaseUrlIndex + 1) % BASE_URLS.length;
      }
    }

    throw new HttpException('All API endpoints failed', HttpStatus.BAD_GATEWAY);
  }

  getBaseUrl(): string {
    return BASE_URLS[this.currentBaseUrlIndex];
  }
}
