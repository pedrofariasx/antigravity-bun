import { Module, Global } from '@nestjs/common';
import { EventsService } from './events.service';
import { DashboardGateway } from './dashboard.gateway';

@Global()
@Module({
  providers: [EventsService, DashboardGateway],
  exports: [EventsService],
})
export class EventsModule {}
