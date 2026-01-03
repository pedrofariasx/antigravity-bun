import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  Res,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiKeysService } from './api-keys.service';
import { AuthService } from '../auth/auth.service';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';

// Simple auth guard for dashboard routes
function checkDashboardAuth(authService: AuthService, req: Request): boolean {
  const sessionId = req.cookies?.session;
  return authService.validateSession(sessionId);
}

import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @IsOptional()
  dailyLimit?: number;

  @IsNumber()
  @IsOptional()
  rateLimitPerMinute?: number;

  @IsNumber()
  @IsOptional()
  smartContext?: number;
}

class UpdateApiKeyDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @IsOptional()
  dailyLimit?: number;

  @IsNumber()
  @IsOptional()
  rateLimitPerMinute?: number;

  @IsNumber()
  @IsOptional()
  smartContext?: number;

  @IsNumber()
  @IsOptional()
  smartContextLimit?: number;

  @IsString()
  @IsOptional()
  allowedModels?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  corsOrigin?: string;
}

@ApiTags('API Keys')
@Controller('api/keys')
export class ApiKeysController {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all API keys' })
  getAllKeys(@Req() req: Request, @Res() res: Response) {
    if (!checkDashboardAuth(this.authService, req)) {
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ error: 'Unauthorized' });
    }

    const keys = this.apiKeysService.getAllApiKeys();
    // Mask the keys for security
    const maskedKeys = keys.map((k) => ({
      ...k,
      key: k.key.substring(0, 10) + '...' + k.key.substring(k.key.length - 4),
    }));

    return res.json({ keys: maskedKeys });
  }

  @Post()
  @ApiOperation({ summary: 'Create a new API key' })
  @ApiBody({ type: CreateApiKeyDto })
  createKey(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: CreateApiKeyDto,
  ) {
    if (!checkDashboardAuth(this.authService, req)) {
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ error: 'Unauthorized' });
    }

    if (!body.name) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'Name is required' });
    }

    const { key, id } = this.apiKeysService.createApiKey(
      body.name,
      body.dailyLimit || 0,
      body.rateLimitPerMinute || 60,
      body.smartContext || 0,
    );

    return res.status(HttpStatus.CREATED).json({
      success: true,
      id,
      key, // Return the full key only on creation
      message:
        'API key created successfully. Save this key - it will not be shown again.',
    });
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate an API key' })
  deactivateKey(
    @Req() req: Request,
    @Res() res: Response,
    @Param('id') id: string,
  ) {
    if (!checkDashboardAuth(this.authService, req)) {
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ error: 'Unauthorized' });
    }

    const success = this.apiKeysService.deactivateApiKey(parseInt(id, 10));

    if (!success) {
      return res
        .status(HttpStatus.NOT_FOUND)
        .json({ error: 'API key not found' });
    }

    return res.json({ success: true, message: 'API key deactivated' });
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate an API key' })
  activateKey(
    @Req() req: Request,
    @Res() res: Response,
    @Param('id') id: string,
  ) {
    if (!checkDashboardAuth(this.authService, req)) {
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ error: 'Unauthorized' });
    }

    const success = this.apiKeysService.activateApiKey(parseInt(id, 10));

    if (!success) {
      return res
        .status(HttpStatus.NOT_FOUND)
        .json({ error: 'API key not found' });
    }

    return res.json({ success: true, message: 'API key activated' });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an API key' })
  @ApiBody({ type: UpdateApiKeyDto })
  updateKey(
    @Req() req: Request,
    @Res() res: Response,
    @Param('id') id: string,
    @Body() body: UpdateApiKeyDto,
  ) {
    if (!checkDashboardAuth(this.authService, req)) {
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ error: 'Unauthorized' });
    }

    const success = this.apiKeysService.updateApiKey(parseInt(id, 10), body);

    if (!success) {
      return res
        .status(HttpStatus.NOT_FOUND)
        .json({ error: 'API key not found' });
    }

    return res.json({ success: true, message: 'API key updated' });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an API key' })
  deleteKey(
    @Req() req: Request,
    @Res() res: Response,
    @Param('id') id: string,
  ) {
    if (!checkDashboardAuth(this.authService, req)) {
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ error: 'Unauthorized' });
    }

    const success = this.apiKeysService.deleteApiKey(parseInt(id, 10));

    if (!success) {
      return res
        .status(HttpStatus.NOT_FOUND)
        .json({ error: 'API key not found' });
    }

    return res.json({ success: true, message: 'API key deleted' });
  }

  @Post(':id/smart-context')
  @ApiOperation({ summary: 'Toggle Smart Context for an API key' })
  toggleSmartContext(
    @Req() req: Request,
    @Res() res: Response,
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
  ) {
    if (!checkDashboardAuth(this.authService, req)) {
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ error: 'Unauthorized' });
    }

    const success = this.apiKeysService.toggleSmartContext(
      parseInt(id, 10),
      body.enabled,
    );

    if (!success) {
      return res
        .status(HttpStatus.NOT_FOUND)
        .json({ error: 'API key not found' });
    }

    return res.json({
      success: true,
      message: `Smart Context ${body.enabled ? 'enabled' : 'disabled'}`,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get API usage statistics' })
  getStats(@Req() req: Request, @Res() res: Response) {
    if (!checkDashboardAuth(this.authService, req)) {
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ error: 'Unauthorized' });
    }

    const stats = this.apiKeysService.getStats();
    return res.json({ stats });
  }

  @Get('logs')
  @ApiOperation({ summary: 'Get recent request logs' })
  getLogs(@Req() req: Request, @Res() res: Response) {
    if (!checkDashboardAuth(this.authService, req)) {
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ error: 'Unauthorized' });
    }

    const logs = this.apiKeysService.getRecentLogs(100);
    return res.json({ logs });
  }
}
