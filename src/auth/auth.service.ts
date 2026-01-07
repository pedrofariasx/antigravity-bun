import * as crypto from 'crypto';
import { config } from '../config/configuration';

export class AuthService {
  private readonly dashboardUsername: string;
  private readonly dashboardPassword: string;

  constructor() {
    this.dashboardUsername = config.auth.dashboardUsername;
    this.dashboardPassword = config.auth.dashboardPassword;
  }

  validateDashboardCredentials(username: string, password: string): boolean {
    return (
      username === this.dashboardUsername && password === this.dashboardPassword
    );
  }

  generateApiKey(): string {
    return `sk-ag-${crypto.randomBytes(24).toString('hex')}`;
  }

  hashApiKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  generateSessionId(): string {
    return crypto.randomUUID();
  }
}

export const authService = new AuthService();
