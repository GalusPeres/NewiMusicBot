import { jest } from '@jest/globals';

jest.unstable_mockModule('../utils/logger.js', () => ({ default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const { default: LavalinkReconnectManager } = await import('../utils/reconnectManager.js');

describe('LavalinkReconnectManager', () => {
  test('startHealthMonitoring and stop manage intervals', () => {
    jest.useFakeTimers();
    const client = {
      lavalink: {
        nodeManager: { nodes: new Map() },
        on: jest.fn(),
        players: new Map()
      },
      guilds: { cache: new Map() }
    };
    const mgr = new LavalinkReconnectManager(client);
    mgr.startHealthMonitoring();
    expect(mgr.healthCheckInterval).toBeTruthy();
    expect(mgr.quickHealthCheckInterval).toBeTruthy();
    mgr.stop();
    expect(mgr.healthCheckInterval).toBeNull();
    expect(mgr.quickHealthCheckInterval).toBeNull();
    jest.useRealTimers();
  });
});
