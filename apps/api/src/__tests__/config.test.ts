import { describe, it, expect, beforeEach } from 'vitest';
import { loadConfig, resetConfig } from '../config.js';

describe('Config', () => {
  beforeEach(() => {
    resetConfig();
  });

  it('loads config with defaults', () => {
    process.env['NODE_ENV'] = 'test';
    const config = loadConfig();
    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBe(3001);
    expect(config.HOST).toBe('0.0.0.0');
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.RATE_LIMIT_MAX).toBe(100);
  });

  it('overrides with env vars', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['PORT'] = '8080';
    process.env['LOG_LEVEL'] = 'warn';
    const config = loadConfig();
    expect(config.PORT).toBe(8080);
    expect(config.LOG_LEVEL).toBe('warn');
    // Cleanup
    delete process.env['PORT'];
    delete process.env['LOG_LEVEL'];
    process.env['NODE_ENV'] = 'test';
  });

  it('rejects invalid NODE_ENV', () => {
    process.env['NODE_ENV'] = 'invalid';
    expect(() => loadConfig()).toThrow('Invalid environment variables');
    process.env['NODE_ENV'] = 'test';
  });
});
