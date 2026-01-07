import axios, { AxiosResponse } from 'axios';
import { config } from '../config/configuration';
import { accountsService } from '../accounts/accounts.service';

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

export class OAuthService {
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

  constructor() {
    this.CLIENT_ID =
      config.antigravity.clientId ||
      '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
    this.CLIENT_SECRET =
      config.antigravity.clientSecret || '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';
  }

  getRedirectUri(): string {
    const envRedirect = config.oauth.redirectUri;
    if (envRedirect) {
      return envRedirect;
    }

    const port = config.port || 3000;
    const path = config.oauth.callbackPath || '/oauth/callback';
    return `http://localhost:${port}${path}`;
  }

  getAuthorizationUrl(): string {
    const redirectUri = this.getRedirectUri();
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
    console.log('[OAuth] Exchanging authorization code for tokens...');

    const response: AxiosResponse<TokenResponse> = await axios.post(
      this.TOKEN_URI,
      new URLSearchParams({
        code,
        client_id: this.CLIENT_ID,
        client_secret: this.CLIENT_SECRET,
        redirect_uri: this.getRedirectUri(),
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
      console.log(`[OAuth] Authenticated as: ${email}`);
    } catch {
      console.warn('[OAuth] Could not fetch user email');
    }

    const { id, accountNumber, isNew } = accountsService.addAccount({
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
      totalAccounts: accountsService.getAccountCount(),
    };
  }
}

export const oauthService = new OAuthService();
