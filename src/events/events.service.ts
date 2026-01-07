import { Subject } from 'rxjs';

export class EventsService {
  // Subject to bridge between services and the WebSocket (Elysia WS)
  private readonly eventsSubject = new Subject<{ event: string; data: any }>();
  public readonly events$ = this.eventsSubject.asObservable();

  emit(event: string, data: any) {
    console.debug(`[Events] Emitting event: ${event}`);
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

export const eventsService = new EventsService();
