import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeysService } from '../../api-keys/api-keys.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const isAnthropicEndpoint = request.path === '/v1/messages';

    // If no API keys in DB, allow all requests (open mode)
    // REMOVED: This caused confusion after database reset.
    // Now the system is secure by default - if no keys exist, no access is allowed.
    // User must create a key in the dashboard.
    const dbKeysCount = this.apiKeysService.getAllApiKeys().length;
    /*
    if (dbKeysCount === 0) {
      return true;
    }
    */

    let token = '';
    try {
      token = isAnthropicEndpoint
        ? this.extractAnthropicKey(request)
        : this.extractOpenAIKey(request);
    } catch (e) {
      // If we failed to extract but there's no protection, let it pass
      /*
      if (dbKeysCount === 0) {
        return true;
      }
      */
      throw e;
    }

    // Validate against Database API keys
    const { valid, keyData } = this.apiKeysService.validateApiKey(token);
    if (valid && keyData) {
      // Validate CORS Origin if specified
      const origin = request.headers.origin as string;
      if (
        keyData.cors_origin &&
        keyData.cors_origin !== '*' &&
        origin &&
        origin !== 'null'
      ) {
        const allowedOrigins = keyData.cors_origin
          .split(',')
          .map((o) => o.trim().toLowerCase());
        if (!allowedOrigins.includes(origin.toLowerCase())) {
          throw new HttpException(
            {
              error: {
                message: `Origin '${origin}' is not allowed for this API key.`,
                type: 'invalid_request_error',
                param: 'origin',
                code: 'cors_not_allowed',
              },
            },
            HttpStatus.FORBIDDEN,
          );
        }
      }

      // Check if model is allowed
      if (keyData.allowed_models && keyData.allowed_models !== '*') {
        const allowedModels = keyData.allowed_models
          .split(',')
          .map((m) => m.trim().toLowerCase());
        const requestedModel = (request.body?.model || '').toLowerCase();

        if (requestedModel && !allowedModels.includes(requestedModel)) {
          if (isAnthropicEndpoint) {
            throw new HttpException(
              {
                type: 'error',
                error: {
                  type: 'invalid_request_error',
                  message: `Model '${requestedModel}' is not allowed for this API key.`,
                },
              },
              HttpStatus.FORBIDDEN,
            );
          }
          throw new HttpException(
            {
              error: {
                message: `Model '${requestedModel}' is not allowed for this API key.`,
                type: 'invalid_request_error',
                param: 'model',
                code: 'model_not_allowed',
              },
            },
            HttpStatus.FORBIDDEN,
          );
        }
      }

      // Attach key info to request for logging later
      (request as any).apiKey = keyData;
      return true;
    }

    // Auth failed
    const maskedKey =
      token && token.length > 8
        ? `${token.slice(0, 4)}...${token.slice(-4)}`
        : '****';

    if (isAnthropicEndpoint) {
      throw new HttpException(
        {
          type: 'error',
          error: {
            type: 'authentication_error',
            message: `Invalid API key provided: ${maskedKey}`,
          },
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    throw new HttpException(
      {
        error: {
          message: `Incorrect API key provided: ${maskedKey}. You can create API keys in the dashboard.`,
          type: 'authentication_error',
          param: null,
          code: 'invalid_api_key',
        },
      },
      HttpStatus.UNAUTHORIZED,
    );
  }

  private extractAnthropicKey(request: any): string {
    const xApiKey = request.headers['x-api-key'];

    if (!xApiKey || typeof xApiKey !== 'string') {
      throw new HttpException(
        {
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Missing required header: x-api-key',
          },
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    return xApiKey;
  }

  private extractOpenAIKey(request: any): string {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new HttpException(
        {
          error: {
            message:
              "You didn't provide an API key. You need to provide your API key in an Authorization header using Bearer auth (i.e. Authorization: Bearer YOUR_KEY).",
            type: 'authentication_error',
            param: null,
            code: 'invalid_api_key',
          },
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      throw new HttpException(
        {
          error: {
            message:
              'Invalid Authorization header format. Expected: Bearer YOUR_KEY',
            type: 'authentication_error',
            param: null,
            code: 'invalid_api_key',
          },
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    return token;
  }
}
