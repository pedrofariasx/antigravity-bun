import {
  Controller,
  Get,
  Query,
  Res,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { OAuthService } from './oauth.service';

@Controller('oauth')
@ApiTags('OAuth')
export class OAuthController {
  constructor(private readonly oauthService: OAuthService) {}

  @Get('authorize')
  @ApiOperation({
    summary: 'Start OAuth flow',
    description: 'Redirects to Google OAuth authorization page',
  })
  @ApiResponse({ status: 302, description: 'Redirect to Google OAuth' })
  authorize(@Res() res: Response) {
    const authUrl = this.oauthService.getAuthorizationUrl();
    res.redirect(authUrl);
  }

  @Get('callback')
  @ApiOperation({
    summary: 'OAuth callback',
    description:
      'Handles OAuth callback from Google and exchanges code for tokens',
  })
  @ApiQuery({
    name: 'code',
    required: false,
    description: 'Authorization code from Google',
  })
  @ApiQuery({ name: 'error', required: false, description: 'Error from OAuth' })
  @ApiResponse({
    status: 200,
    description: 'Success page with account credentials',
  })
  @ApiResponse({ status: 400, description: 'Missing authorization code' })
  @ApiResponse({ status: 500, description: 'Token exchange failed' })
  async callback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    // Página invisível - processa e fecha/redireciona instantaneamente
    const sendResponseAndClose = (
      success: boolean,
      data: Record<string, unknown>,
    ) => {
      const messageData = JSON.stringify(data);

      // HTML ultra-minimalista: fundo preto, executa script e fecha/redireciona
      res.status(200)
        .send(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{background:#000;margin:0}</style></head><body><script>
(function(){
  var data = ${messageData};
  if (window.opener) {
    window.opener.postMessage(data, '*');
    window.close();
  } else if (window.parent !== window) {
    window.parent.postMessage(data, '*');
  } else {
    window.location.href = '/';
  }
})();
</script></body></html>`);
    };

    if (error) {
      sendResponseAndClose(false, {
        type: 'OAUTH_ERROR',
        message: error,
      });
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

      sendResponseAndClose(true, {
        type: 'OAUTH_SUCCESS',
        email: result.email,
        accountNumber: result.accountNumber,
        totalAccounts: result.totalAccounts,
        isNewAccount: result.isNewAccount,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      sendResponseAndClose(false, {
        type: 'OAUTH_ERROR',
        message: message,
      });
    }
  }

  @Get('status')
  @ApiOperation({
    summary: 'Get OAuth status',
    description: 'Returns OAuth configuration information',
  })
  @ApiResponse({ status: 200, description: 'OAuth status' })
  getStatus() {
    return {
      authUrl: this.oauthService.getAuthorizationUrl(),
      callbackUrl: this.oauthService.getRedirectUri(),
      instructions: 'Visit /oauth/authorize to start authentication',
    };
  }
}
