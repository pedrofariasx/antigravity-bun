import {
  Controller,
  Get,
  Query,
  Res,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { OAuthService } from './oauth.service';

@Controller('oauth')
export class OAuthController {
  constructor(private readonly oauthService: OAuthService) {}

  @Get('authorize')
  authorize(@Res() res: Response) {
    const authUrl = this.oauthService.getAuthorizationUrl();
    res.redirect(authUrl);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    if (error) {
      res.status(400).send(`
        <html>
        <head><title>OAuth Error</title></head>
        <body>
          <h1>Authentication Failed</h1>
          <p>Error: ${error}</p>
          <p><a href="/oauth/authorize">Try again</a></p>
        </body>
        </html>
      `);
      return;
    }

    if (!code) {
      throw new HttpException(
        'Missing authorization code',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const result = await this.oauthService.exchangeCodeForTokens(code);

      res.status(200).send(`
        <html>
        <head>
          <title>OAuth Success</title>
          <style>
            body { font-family: system-ui, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
            h1 { color: #22c55e; }
            pre { background: #1e1e1e; color: #d4d4d4; padding: 20px; border-radius: 8px; overflow-x: auto; }
            .copy-btn { background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; margin-top: 10px; }
            .copy-btn:hover { background: #2563eb; }
            .email { color: #6b7280; }
          </style>
        </head>
        <body>
          <h1>Authentication Successful!</h1>
          ${result.email ? `<p class="email">Logged in as: ${result.email}</p>` : ''}
          <p>Add these to your <code>.env</code> file:</p>
          <pre id="env-content">ANTIGRAVITY_ACCESS_TOKEN=${result.accessToken}
ANTIGRAVITY_REFRESH_TOKEN=${result.refreshToken}
ANTIGRAVITY_EXPIRY_DATE=${result.expiryDate}${result.email ? `\nANTIGRAVITY_EMAIL=${result.email}` : ''}</pre>
          <button class="copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('env-content').textContent).then(() => this.textContent = 'Copied!')">
            Copy to Clipboard
          </button>
          <p style="margin-top: 30px; color: #6b7280;">
            After adding to .env, restart the server with <code>npm run start:dev</code>
          </p>
        </body>
        </html>
      `);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).send(`
        <html>
        <head><title>OAuth Error</title></head>
        <body>
          <h1>Token Exchange Failed</h1>
          <p>Error: ${message}</p>
          <p><a href="/oauth/authorize">Try again</a></p>
        </body>
        </html>
      `);
    }
  }

  @Get('status')
  getStatus() {
    return {
      authUrl: this.oauthService.getAuthorizationUrl(),
      callbackUrl: this.oauthService.getRedirectUri(),
      instructions: 'Visit /oauth/authorize to start authentication',
    };
  }
}
