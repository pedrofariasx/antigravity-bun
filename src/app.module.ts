import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
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
    DatabaseModule,
    AuthModule,
    ApiKeysModule,
    AccountsModule,
    AntigravityModule,
    OAuthModule,
    QuotaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
