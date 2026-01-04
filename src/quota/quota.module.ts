import { Module, forwardRef } from '@nestjs/common';
import { QuotaService } from './quota.service';
import { AccountsModule } from '../accounts/accounts.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [forwardRef(() => AccountsModule), EventsModule],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}
