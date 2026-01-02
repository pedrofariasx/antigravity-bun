import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';

@Injectable()
export class AppService {
  private dashboardTemplate: string;
  private loginTemplate: string;

  constructor() {
    try {
      this.dashboardTemplate = readFileSync(
        join(__dirname, '..', 'public', 'index.html'),
        'utf8',
      );
    } catch {
      this.dashboardTemplate = '<h1>Dashboard Template Not Found</h1>';
    }

    try {
      this.loginTemplate = readFileSync(
        join(__dirname, '..', 'public', 'login.html'),
        'utf8',
      );
    } catch {
      this.loginTemplate = '<h1>Login Template Not Found</h1>';
    }
  }

  getHealth(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  getDashboard(): string {
    return this.dashboardTemplate;
  }

  getLoginPage(): string {
    return this.loginTemplate;
  }
}
