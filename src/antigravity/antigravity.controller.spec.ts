import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { AntigravityController } from './antigravity.controller';
import { AntigravityService } from './antigravity.service';
import { ChatCompletionRequestDto } from './dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

describe('AntigravityController', () => {
  let controller: AntigravityController;
  let service: AntigravityService;

  const mockAntigravityService = {
    chatCompletion: jest.fn(),
    chatCompletionStream: jest.fn(),
    listModels: jest.fn(),
  };

  const mockApiKeyGuard = {
    canActivate: jest.fn(() => true),
  };

  const createMockResponse = () =>
    ({
      setHeader: jest.fn(),
    }) as unknown as Response;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AntigravityController],
      providers: [
        {
          provide: AntigravityService,
          useValue: mockAntigravityService,
        },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue(mockApiKeyGuard)
      .compile();

    controller = module.get<AntigravityController>(AntigravityController);
    service = module.get<AntigravityService>(AntigravityService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('chatCompletions', () => {
    it('should call service.chatCompletion when stream is false', async () => {
      const dto: ChatCompletionRequestDto = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false,
      };
      const mockResponse = createMockResponse();
      const expectedResult = { id: 'test-id', choices: [] };

      mockAntigravityService.chatCompletion.mockResolvedValue(expectedResult);

      const result = await controller.chatCompletions(dto, mockResponse);

      expect(service.chatCompletion).toHaveBeenCalledWith(dto);
      expect(service.chatCompletionStream).not.toHaveBeenCalled();
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'x-request-id',
        expect.stringMatching(/^req_/),
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'openai-processing-ms',
        expect.any(String),
      );
      expect(result).toEqual(expectedResult);
    });

    it('should call service.chatCompletionStream when stream is true and set appropriate headers', async () => {
      const dto: ChatCompletionRequestDto = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      };
      const mockResponse = createMockResponse();

      mockAntigravityService.chatCompletionStream.mockResolvedValue(undefined);

      const result = await controller.chatCompletions(dto, mockResponse);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'x-request-id',
        expect.stringMatching(/^req_/),
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/event-stream',
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-cache',
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Connection',
        'keep-alive',
      );
      expect(service.chatCompletionStream).toHaveBeenCalledWith(
        dto,
        mockResponse,
      );
      expect(service.chatCompletion).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });

  describe('listModels', () => {
    it('should call service.listModels', () => {
      const expectedResult = { data: [{ id: 'model-1' }] };
      const mockResponse = createMockResponse();

      mockAntigravityService.listModels.mockReturnValue(expectedResult);

      const result = controller.listModels(mockResponse);

      expect(service.listModels).toHaveBeenCalled();
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'x-request-id',
        expect.stringMatching(/^req_/),
      );
      expect(result).toEqual(expectedResult);
    });
  });
});
