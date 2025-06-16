import { jest } from '@jest/globals';

jest.unstable_mockModule('fs', () => ({
  default: { readFileSync: jest.fn(() => JSON.stringify({ logLevel: 'debug' })) },
  readFileSync: jest.fn(() => JSON.stringify({ logLevel: 'debug' }))
}));

const logger = (await import('../utils/logger.js')).default;

describe('logger', () => {
  test('debug logs when level allows', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    logger.debug('test');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
