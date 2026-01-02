import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { AccountsService } from './accounts/accounts.service';
import { OpenAIExceptionFilter } from './common/filters/openai-exception.filter';
import { json, urlencoded } from 'express';
import { join } from 'path';
import * as express from 'express';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Unified App - Single instance for both Admin Dashboard and API Proxy
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // Middleware
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  app.use(cookieParser());
  app.use('/public', express.static(join(__dirname, '..', 'public')));

  // Global filters and pipes
  app.useGlobalFilters(new OpenAIExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableCors();

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Antigravity API')
    .setDescription('OpenAI and Anthropic compatible API proxy')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, documentFactory, {
    customJs: '/public/swagger-theme.js',
  });

  const configService = app.get(ConfigService);
  const accountsService = app.get(AccountsService);

  const port = configService.get<number>('port') || 3000;

  if (!accountsService.hasAccounts()) {
    logger.warn('='.repeat(60));
    logger.warn('NO ACCOUNTS CONFIGURED');
    logger.warn('='.repeat(60));
    logger.warn(`Visit: http://localhost:${port}/oauth/authorize`);
    logger.warn('='.repeat(60));
  }

  await app.listen(port);

  logger.log('='.repeat(60));
  logger.log(`ANTIGRAVITY SERVER: http://localhost:${port}`);
  logger.log(`Dashboard:          http://localhost:${port}/`);
  logger.log(`API Proxy:          http://localhost:${port}/v1/`);
  logger.log(`API Docs:           http://localhost:${port}/docs`);
  logger.log('='.repeat(60));
}
void bootstrap();
