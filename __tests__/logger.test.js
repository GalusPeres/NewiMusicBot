import { jest } from '@jest/globals';

process.env.LOG_LEVEL = 'debug';
const logger = (await import('../utils/logger.js')).default;

describe('logger', () => {
  test('debug logs when level allows', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    logger.debug('test');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
