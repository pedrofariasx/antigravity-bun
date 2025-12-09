export interface OAuthCredential {
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  clientId: string;
  clientSecret: string;
  projectId?: string;
  email?: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

export interface UserInfo {
  email: string;
  name?: string;
  picture?: string;
}
