import { jest } from '@jest/globals';

jest.unstable_mockModule('../utils/logger.js', () => ({ default: { info: jest.fn(), debug: jest.fn() } }));

const { default: CleanupManager } = await import('../utils/cleanupManager.js');

describe('CleanupManager', () => {
  test('start and stop manage intervals', () => {
    jest.useFakeTimers();
    const client = { lavalink: { players: new Map() } };
    const mgr = new CleanupManager(client);
    mgr.start();
    expect(mgr.intervals.size).toBe(2);
    mgr.stop();
    expect(mgr.intervals.size).toBe(0);
    jest.useRealTimers();
  });
});
