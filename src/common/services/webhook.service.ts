import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  async sendNotification(url: string, event: string, data: any) {
    if (!url) return;

    try {
      await axios.post(url, {
        event,
        timestamp: new Date().toISOString(),
        data,
      });
      this.logger.debug(`Webhook sent to ${url} for event ${event}`);
    } catch (error) {
      this.logger.error(`Failed to send webhook to ${url}: ${error.message}`);
    }
  }

  async notifyAccountError(url: string, email: string, error: string) {
    await this.sendNotification(url, 'account.error', { email, error });
  }

  async notifyQuotaExhausted(url: string, email: string, model: string) {
    await this.sendNotification(url, 'quota.exhausted', { email, model });
  }
}
