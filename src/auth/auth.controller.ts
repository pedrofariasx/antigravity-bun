import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  HttpStatus,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';

import { IsString, IsNotEmpty } from 'class-validator';

class LoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Login to dashboard' })
  @ApiBody({ type: LoginDto })
  login(@Body() body: LoginDto, @Res() res: Response) {
    try {
      const { username, password } = body;

      // Log para debug (remova em produção)
      console.log(`[Login Attempt] User: ${username}`);

      if (!this.authService.validateCredentials(username, password)) {
        return res.status(HttpStatus.UNAUTHORIZED).json({
          success: false,
          message: 'Invalid credentials',
        });
      }

      const { sessionId, expiresAt } = this.authService.createSession();

      res.cookie('session', sessionId, {
        httpOnly: true,
        secure: false, // Forçamos false para teste local em HTTP
        sameSite: 'lax',
        expires: expiresAt,
        path: '/',
      });

      return res.json({
        success: true,
        message: 'Login successful',
      });
    } catch (error) {
      console.error('[Login Error]', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Internal server error during login',
        error: error.message,
      });
    }
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout from dashboard' })
  logout(@Req() req: Request, @Res() res: Response) {
    const sessionId = req.cookies?.session;

    if (sessionId) {
      this.authService.destroySession(sessionId);
    }

    res.clearCookie('session', { path: '/' });

    return res.json({
      success: true,
      message: 'Logged out successfully',
    });
  }

  @Get('check')
  @ApiOperation({ summary: 'Check if session is valid' })
  checkSession(@Req() req: Request, @Res() res: Response) {
    const sessionId = req.cookies?.session;
    const isValid = this.authService.validateSession(sessionId);

    return res.json({
      authenticated: isValid,
    });
  }
}
