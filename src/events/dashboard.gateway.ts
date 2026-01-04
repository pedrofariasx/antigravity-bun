import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { EventsService } from './events.service';
import { Subscription } from 'rxjs';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class DashboardGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(DashboardGateway.name);
  private subscription: Subscription;

  constructor(private readonly eventsService: EventsService) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');

    // Subscribe to internal events and broadcast to all connected clients
    this.subscription = this.eventsService.events$.subscribe(
      ({ event, data }) => {
        this.server.emit(event, data);
      },
    );
  }

  handleConnection(client: Socket, ...args: any[]) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Cleanup on destroy
  onModuleDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}
