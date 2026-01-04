import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  // Subject to bridge between services and the WebSocket gateway
  private readonly eventsSubject = new Subject<{ event: string; data: any }>();
  public readonly events$ = this.eventsSubject.asObservable();

  emit(event: string, data: any) {
    this.logger.debug(`Emitting event: ${event}`);
    this.eventsSubject.next({ event, data });
  }

  emitDashboardUpdate(data: any) {
    this.emit('dashboard.update', data);
  }

  emitAnalyticsNewRequest(data: any) {
    this.emit('analytics.newRequest', data);
  }

  emitAccountStatusChange(data: any) {
    this.emit('account.statusChange', data);
  }
}
