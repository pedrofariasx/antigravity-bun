import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './antigravity/services/auth.service';
import { OpenAIExceptionFilter } from './common/filters/openai-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.useGlobalFilters(new OpenAIExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  // Enable CORS
  app.enableCors();

  const configService = app.get(ConfigService);
  const authService = app.get(AuthService);
  const port = configService.get<number>('port') || 3000;

  // Check if credentials are available
  if (!authService.hasCredentials()) {
    logger.warn('='.repeat(60));
    logger.warn('ANTIGRAVITY CREDENTIALS NOT FOUND');
    logger.warn('='.repeat(60));
    logger.warn('');
    logger.warn('To use the Antigravity API, you need OAuth credentials.');
    logger.warn('');
    logger.warn('Option 1: Set environment variables:');
    logger.warn('  ANTIGRAVITY_ACCESS_TOKEN=<your-token>');
    logger.warn('  ANTIGRAVITY_REFRESH_TOKEN=<your-refresh-token>');
    logger.warn('  ANTIGRAVITY_EXPIRY_DATE=<expiry-timestamp-ms>');
    logger.warn('');
    logger.warn('Option 2: Start OAuth flow (after server starts):');
    logger.warn(`  Visit: http://localhost:${port}/oauth/authorize`);
    logger.warn('');
    logger.warn('='.repeat(60));
  } else {
    logger.log('Antigravity credentials loaded successfully');
  }

  await app.listen(port);

  logger.log('='.repeat(60));
  logger.log(`Antigravity Proxy running on http://localhost:${port}`);
  logger.log('');
  logger.log('Endpoints:');
  logger.log(`  POST /v1/chat/completions - Chat completion`);
  logger.log(`  GET  /v1/models          - List models`);
  logger.log(`  GET  /oauth/status       - OAuth status`);
  logger.log(`  GET  /oauth/authorize    - Start OAuth flow`);
  logger.log('='.repeat(60));
}
void bootstrap();
