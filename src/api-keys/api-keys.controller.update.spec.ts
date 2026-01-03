import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { AuthService } from '../auth/auth.service';
import { Request, Response } from 'express';
import { HttpStatus } from '@nestjs/common';

describe('ApiKeysController Update', () => {
  let controller: ApiKeysController;
  let apiKeysService: ApiKeysService;
  let authService: AuthService;

  const mockApiKeysService = {
    updateApiKey: jest.fn(),
  };

  const mockAuthService = {
    validateSession: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeysController],
      providers: [
        {
          provide: ApiKeysService,
          useValue: mockApiKeysService,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<ApiKeysController>(ApiKeysController);
    apiKeysService = module.get<ApiKeysService>(ApiKeysService);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('updateKey', () => {
    it('should update an API key successfully', () => {
      const id = '1';
      const updateDto = {
        name: 'Updated Name',
        dailyLimit: 100,
        rateLimitPerMinute: 60,
        smartContext: 1,
      };

      const req = {
        cookies: { session: 'valid-session' },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      mockAuthService.validateSession.mockReturnValue(true);
      mockApiKeysService.updateApiKey.mockReturnValue(true);

      controller.updateKey(req, res, id, updateDto);

      expect(authService.validateSession).toHaveBeenCalledWith('valid-session');
      expect(apiKeysService.updateApiKey).toHaveBeenCalledWith(1, updateDto);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'API key updated',
      });
    });

    it('should return 401 if unauthorized', () => {
      const id = '1';
      const updateDto = { name: 'Updated Name' };

      const req = {
        cookies: {},
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      mockAuthService.validateSession.mockReturnValue(false);

      controller.updateKey(req, res, id, updateDto);

      expect(authService.validateSession).toHaveBeenCalled();
      expect(apiKeysService.updateApiKey).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('should return 404 if API key not found', () => {
      const id = '999';
      const updateDto = { name: 'Updated Name' };

      const req = {
        cookies: { session: 'valid-session' },
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      mockAuthService.validateSession.mockReturnValue(true);
      mockApiKeysService.updateApiKey.mockReturnValue(false);

      controller.updateKey(req, res, id, updateDto);

      expect(apiKeysService.updateApiKey).toHaveBeenCalledWith(999, updateDto);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(res.json).toHaveBeenCalledWith({ error: 'API key not found' });
    });
  });
});
