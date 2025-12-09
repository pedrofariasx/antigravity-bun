import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OAuthService } from './oauth.service';

describe('OAuthService', () => {
  let service: OAuthService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'port') return 3000;
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<OAuthService>(OAuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRedirectUri', () => {
    it('should return localhost URL with port', () => {
      const redirectUri = service.getRedirectUri();
      expect(redirectUri).toBe('http://localhost:3000/oauth/callback');
    });
  });

  describe('getAuthorizationUrl', () => {
    it('should return Google OAuth URL', () => {
      const authUrl = service.getAuthorizationUrl();
      expect(authUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    });

    it('should include required OAuth parameters', () => {
      const authUrl = service.getAuthorizationUrl();
      const url = new URL(authUrl);
      const params = url.searchParams;

      expect(params.get('client_id')).toBeDefined();
      expect(params.get('redirect_uri')).toBe(
        'http://localhost:3000/oauth/callback',
      );
      expect(params.get('scope')).toBeDefined();
      expect(params.get('access_type')).toBe('offline');
      expect(params.get('response_type')).toBe('code');
      expect(params.get('prompt')).toBe('consent');
    });
  });
});
