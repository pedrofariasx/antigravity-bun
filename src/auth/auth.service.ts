import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly dashboardUsername: string;
  private readonly dashboardPassword: string;
  private readonly sessionDuration = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
  ) {
    const user =
      this.configService.get<string>('auth.dashboardUsername') ||
      process.env.DASHBOARD_USERNAME ||
      'admin';
    const pass =
      this.configService.get<string>('auth.dashboardPassword') ||
      process.env.DASHBOARD_PASSWORD ||
      'admin';

    this.dashboardUsername = String(user).trim();
    this.dashboardPassword = String(pass).trim();

    if (this.dashboardPassword === 'admin') {
      this.logger.warn(
        '⚠️ Default dashboard password is being used. Please set DASHBOARD_PASSWORD in .env',
      );
    }

    this.logger.log(
      `Auth service initialized. Target user: [${this.dashboardUsername}]`,
    );
  }

  validateCredentials(username: string, password: string): boolean {
    const inputUser = (username || '').trim();
    const inputPass = (password || '').trim();

    const isUserValid = inputUser === this.dashboardUsername;
    const isPassValid = inputPass === this.dashboardPassword;

    if (!isUserValid || !isPassValid) {
      this.logger.warn(
        `Auth failed for [${inputUser}]. UserMatch: ${isUserValid}, PassMatch: ${isPassValid}`,
      );
      this.logger.debug(
        `Input: [${inputUser}] vs Expected: [${this.dashboardUsername}]`,
      );
      this.logger.debug(
        `Pass length: ${inputPass.length} vs Expected: ${this.dashboardPassword.length}`,
      );
    } else {
      this.logger.log(`Successful login for user: [${inputUser}]`);
    }

    return isUserValid && isPassValid;
  }

  createSession(): { sessionId: string; expiresAt: Date } {
    try {
      const sessionId = uuidv4();
      const expiresAt = new Date(Date.now() + this.sessionDuration);

      this.databaseService.createSession(sessionId, expiresAt);
      this.databaseService.cleanExpiredSessions();

      this.logger.log('New dashboard session created in database');
      return { sessionId, expiresAt };
    } catch (error) {
      this.logger.error(
        `Failed to create session in database: ${error.message}`,
      );
      throw error;
    }
  }

  validateSession(sessionId: string): boolean {
    if (!sessionId) return false;
    try {
      const session = this.databaseService.getSession(sessionId);
      return !!session;
    } catch (error) {
      this.logger.error(`Failed to validate session: ${error.message}`);
      return false;
    }
  }

  destroySession(sessionId: string): void {
    try {
      this.databaseService.deleteSession(sessionId);
      this.logger.log('Dashboard session destroyed');
    } catch (error) {
      this.logger.error(`Failed to destroy session: ${error.message}`);
    }
  }

  // API Key generation
  generateApiKey(): string {
    const prefix = 'ag-';
    const randomBytes = crypto.randomBytes(24).toString('base64url');
    return prefix + randomBytes;
  }

  hashApiKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }
}
