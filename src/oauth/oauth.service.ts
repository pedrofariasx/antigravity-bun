import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';

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
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly CLIENT_ID =
    '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
  private readonly CLIENT_SECRET = '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';
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

  private serverPort: number;

  constructor(private readonly configService: ConfigService) {
    this.serverPort = this.configService.get<number>('port') || 3000;
  }

  getRedirectUri(): string {
    return `http://localhost:${this.serverPort}/oauth/callback`;
  }

  getAuthorizationUrl(): string {
    const params = new URLSearchParams({
      client_id: this.CLIENT_ID,
      redirect_uri: this.getRedirectUri(),
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
        redirect_uri: this.getRedirectUri(),
        grant_type: 'authorization_code',
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const expiryDate = Date.now() + expires_in * 1000;

    // Get user email
    let email: string | undefined;
    try {
      const userInfo: AxiosResponse<UserInfoResponse> = await axios.get(
        this.USER_INFO_URI,
        {
          headers: { Authorization: `Bearer ${access_token}` },
        },
      );
      email = userInfo.data.email;
      this.logger.log(`Authenticated as: ${email}`);
    } catch {
      this.logger.warn('Could not fetch user email');
    }

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiryDate,
      email,
    };
  }
}
