import { Controller, Get, Post, Header, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppService } from './app.service';
import { AccountsService } from './accounts/accounts.service';
import { AntigravityService } from './antigravity/antigravity.service';
import { QuotaService } from './quota/quota.service';
import { AuthService } from './auth/auth.service';
import { DatabaseService } from './database/database.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly accountsService: AccountsService,
    private readonly antigravityService: AntigravityService,
    private readonly quotaService: QuotaService,
    private readonly authService: AuthService,
    private readonly databaseService: DatabaseService,
  ) {}

  @Get('health')
  getHealth(): { status: string; timestamp: string } {
    return this.appService.getHealth();
  }

  @Get('login')
  @Header('Content-Type', 'text/html')
  getLoginPage(): string {
    return this.appService.getLoginPage();
  }

  @Get()
  @Header('Content-Type', 'text/html')
  getDashboard(@Req() req: Request, @Res() res: Response) {
    const sessionId = req.cookies?.session;

    if (!this.authService.validateSession(sessionId)) {
      return res.redirect('/login');
    }

    return res.send(this.appService.getDashboard());
  }

  @Get('api/dashboard')
  getDashboardData(@Req() req: Request, @Res() res: Response) {
    const sessionId = req.cookies?.session;

    if (!this.authService.validateSession(sessionId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const status = this.accountsService.getStatus();
    const quotaAccounts = this.accountsService.getAccountsForQuotaStatus();
    const quotaStatus = this.quotaService.getQuotaStatus(quotaAccounts);
    return res.json({ status, quotaStatus });
  }

  @Get('api/quota/refresh')
  async refreshQuotaApi(@Req() req: Request, @Res() res: Response) {
    const sessionId = req.cookies?.session;

    if (!this.authService.validateSession(sessionId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await this.antigravityService.getQuotaStatus();
    const status = this.accountsService.getStatus();
    const quotaAccounts = this.accountsService.getAccountsForQuotaStatus();
    const quotaStatus = this.quotaService.getQuotaStatus(quotaAccounts);
    return res.json({ status, quotaStatus });
  }

  @Get('api/models')
  getModelsApi(@Req() req: Request, @Res() res: Response) {
    const sessionId = req.cookies?.session;

    if (!this.authService.validateSession(sessionId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const models = this.antigravityService.listModels();
    return res.json(models);
  }

  @Post('api/database/reset')
  resetDatabase(@Req() req: Request, @Res() res: Response) {
    const sessionId = req.cookies?.session;
    if (!this.authService.validateSession(sessionId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const result = this.databaseService.resetDatabase();
    return res.json(result);
  }
}
