import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import {
  OpenAIErrorResponse,
  OpenAIErrorType,
  OpenAIErrorCode,
} from '../interfaces/openai-error.interface';

@Catch()
export class OpenAIExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (response.headersSent) {
      return;
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorResponse: OpenAIErrorResponse;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (
        typeof exceptionResponse === 'object' &&
        'error' in exceptionResponse
      ) {
        const existingError = (
          exceptionResponse as {
            error: { message?: string; type?: string; code?: string | number };
          }
        ).error;
        errorResponse = {
          error: {
            message: existingError.message || exception.message,
            type: existingError.type || this.mapHttpStatusToErrorType(status),
            param: this.extractParam(request),
            code: this.mapHttpStatusToErrorCode(status, existingError.code),
          },
        };
      } else {
        const message =
          typeof exceptionResponse === 'string'
            ? exceptionResponse
            : (exceptionResponse as { message?: string }).message ||
              exception.message;

        errorResponse = {
          error: {
            message,
            type: this.mapHttpStatusToErrorType(status),
            param: this.extractParam(request),
            code: this.mapHttpStatusToErrorCode(status),
          },
        };
      }
    } else if (exception instanceof Error) {
      errorResponse = {
        error: {
          message: exception.message || 'An unexpected error occurred',
          type: 'server_error',
          param: null,
          code: 'server_error',
        },
      };
    } else {
      errorResponse = {
        error: {
          message: 'An unexpected error occurred',
          type: 'server_error',
          param: null,
          code: 'server_error',
        },
      };
    }

    const requestId = this.generateRequestId();
    response.setHeader('x-request-id', requestId);
    response.setHeader('openai-processing-ms', '0');

    response.status(status).json(errorResponse);
  }

  private mapHttpStatusToErrorType(status: number): OpenAIErrorType {
    switch (status) {
      case 400:
        return 'invalid_request_error';
      case 401:
        return 'authentication_error';
      case 403:
        return 'permission_error';
      case 404:
        return 'not_found_error';
      case 429:
        return 'rate_limit_error';
      case 500:
      case 502:
      case 503:
      case 504:
        return 'server_error';
      default:
        return 'server_error';
    }
  }

  private mapHttpStatusToErrorCode(
    status: number,
    existingCode?: string | number,
  ): OpenAIErrorCode {
    if (existingCode && typeof existingCode === 'string') {
      return existingCode as OpenAIErrorCode;
    }

    switch (status) {
      case 400:
        return 'invalid_request_error';
      case 401:
        return 'invalid_api_key';
      case 403:
        return null;
      case 404:
        return 'model_not_found';
      case 429:
        return 'rate_limit_exceeded';
      case 500:
        return 'server_error';
      case 503:
        return 'engine_overloaded';
      case 504:
        return 'timeout';
      default:
        return null;
    }
  }

  private extractParam(request: Request): string | null {
    const body = request.body as { model?: string; messages?: unknown[] };
    if (
      body?.model === undefined &&
      request.path.includes('/chat/completions')
    ) {
      return 'model';
    }
    if (
      body?.messages === undefined &&
      request.path.includes('/chat/completions')
    ) {
      return 'messages';
    }
    return null;
  }

  private generateRequestId(): string {
    const chars =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'req_';
    for (let i = 0; i < 24; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
