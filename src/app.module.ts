import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WebhookService } from './common/services/webhook.service';
import { AccountsModule } from './accounts/accounts.module';
import { AntigravityModule } from './antigravity/antigravity.module';
import { OAuthModule } from './oauth/oauth.module';
import { QuotaModule } from './quota/quota.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    DatabaseModule,
    AuthModule,
    ApiKeysModule,
    AccountsModule,
    AntigravityModule,
    OAuthModule,
    QuotaModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    WebhookService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [WebhookService],
})
export class AppModule {}
