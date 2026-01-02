import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';
import { AccountsService } from '../accounts';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface UserInfoResponse {
  email?: string;
}

export interface OAuthResult {
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  email?: string;
  accountId: string;
  accountNumber: number;
  isNewAccount: boolean;
  totalAccounts: number;
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly CLIENT_ID: string;
  private readonly CLIENT_SECRET: string;
  private readonly TOKEN_URI = 'https://oauth2.googleapis.com/token';
  private readonly USER_INFO_URI =
    'https://www.googleapis.com/oauth2/v1/userinfo';
  private readonly SCOPES = [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/cclog',
    'https://www.googleapis.com/auth/experimentsandconfigs',
  ];
  private getRedirectUriInternal(): string {
    // 1. Prioridade máxima: URL definida via variável de ambiente (OAUTH_REDIRECT_URI)
    const envRedirect = this.configService.get<string>('oauth.redirectUri');
    if (envRedirect) {
      return envRedirect;
    }

    // 2. Fallback inteligente: constrói URL baseada na porta principal
    // Isso resolve o problema de redirecionar para portas erradas (3001 vs 3000)
    const port = this.configService.get<number>('port') || 3000;
    const path =
      this.configService.get<string>('oauth.callbackPath') || '/oauth/callback';
    return `http://localhost:${port}${path}`;
  }

  constructor(
    private readonly configService: ConfigService,
    private readonly accountsService: AccountsService,
  ) {
    // Permite sobrescrever credenciais via .env
    this.CLIENT_ID =
      this.configService.get<string>('antigravity.clientId') ||
      '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
    this.CLIENT_SECRET =
      this.configService.get<string>('antigravity.clientSecret') ||
      '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';
  }

  getRedirectUri(): string {
    return this.getRedirectUriInternal();
  }

  getAuthorizationUrl(): string {
    const redirectUri = this.getRedirectUriInternal();
    const params = new URLSearchParams({
      client_id: this.CLIENT_ID,
      redirect_uri: redirectUri,
      scope: this.SCOPES.join(' '),
      access_type: 'offline',
      response_type: 'code',
      prompt: 'consent',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<OAuthResult> {
    this.logger.log('Exchanging authorization code for tokens...');

    const response: AxiosResponse<TokenResponse> = await axios.post(
      this.TOKEN_URI,
      new URLSearchParams({
        code,
        client_id: this.CLIENT_ID,
        client_secret: this.CLIENT_SECRET,
        redirect_uri: this.getRedirectUriInternal(),
        grant_type: 'authorization_code',
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const expiryDate = Date.now() + expires_in * 1000;

    let email = 'unknown';
    try {
      const userInfo: AxiosResponse<UserInfoResponse> = await axios.get(
        this.USER_INFO_URI,
        {
          headers: { Authorization: `Bearer ${access_token}` },
        },
      );
      email = userInfo.data.email || 'unknown';
      this.logger.log(`Authenticated as: ${email}`);
    } catch {
      this.logger.warn('Could not fetch user email');
    }

    const { id, accountNumber, isNew } = this.accountsService.addAccount({
      email,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiryDate,
    });

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiryDate,
      email,
      accountId: id,
      accountNumber,
      isNewAccount: isNew,
      totalAccounts: this.accountsService.getAccountCount(),
    };
  }
}
