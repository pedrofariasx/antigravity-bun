import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import type { Response } from 'express';
import { AntigravityService } from './antigravity.service';
import { ChatCompletionRequestDto } from './dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@Controller('v1')
@UseGuards(ApiKeyGuard)
export class AntigravityController {
  constructor(private readonly antigravityService: AntigravityService) {}

  @Post('chat/completions')
  @HttpCode(200)
  async chatCompletions(
    @Body() dto: ChatCompletionRequestDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (dto.stream) {
      // For streaming, we need to handle the response manually
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      await this.antigravityService.chatCompletionStream(dto, res);
      return; // Response is handled by the service
    }

    return this.antigravityService.chatCompletion(dto);
  }

  @Get('models')
  listModels() {
    return this.antigravityService.listModels();
  }
}
