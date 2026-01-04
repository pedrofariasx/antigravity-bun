import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AntigravityController } from './antigravity.controller';
import { AntigravityService } from './antigravity.service';
import { AnthropicTransformerService } from './services/anthropic-transformer.service';
import { TransformerService } from './services/transformer.service';
import { AntigravityClientService } from './services/antigravity-client.service';
import { QuotaModule } from '../quota/quota.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';

@Module({
  imports: [ConfigModule, QuotaModule, ApiKeysModule],
  controllers: [AntigravityController],
  providers: [
    AntigravityService,
    AnthropicTransformerService,
    TransformerService,
    AntigravityClientService,
  ],
  exports: [AntigravityService],
})
export class AntigravityModule {}
