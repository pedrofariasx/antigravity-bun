import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from './database.service';
import { join } from 'path';
import * as fs from 'fs';

describe('DatabaseService', () => {
  let service: DatabaseService;
  const dbPath = join(__dirname, '..', '..', 'data', 'antigravity.db');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DatabaseService],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
    service.onModuleInit();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should reset database without clearing sessions', () => {
    // Setup initial state
    service.createSession('test-session', new Date(Date.now() + 10000));
    service.createApiKey('Test Key', 'ag-test-hash', 100);

    // Verify setup
    expect(service.getSession('test-session')).toBeDefined();
    expect(service.getApiKeyByHash('ag-test-hash')).toBeDefined();

    // Reset
    service.resetDatabase();

    // Verify after reset
    expect(service.getSession('test-session')).toBeDefined(); // Should still exist
    expect(service.getApiKeyByHash('ag-test-hash')).toBeUndefined(); // Should be gone
  });

  it('should import data correctly', () => {
    service.resetDatabase();

    const backupData = {
      api_keys: [
        {
          id: 1,
          key: 'ag-imported-hash',
          name: 'Imported Key',
          created_at: new Date().toISOString(),
          is_active: 1,
          daily_limit: 1000,
          rate_limit_per_minute: 60,
          smart_context: 0,
          smart_context_limit: 10,
          allowed_models: '*',
          cors_origin: '*',
        },
      ],
      accounts: [],
      request_logs: [],
    };

    service.importData(backupData);

    const key = service.getApiKeyByHash('ag-imported-hash');
    expect(key).toBeDefined();
    // Use type assertion or access property directly since return type is inferred as unknown by TS in test context sometimes
    expect((key as any).name).toBe('Imported Key');
  });
});
