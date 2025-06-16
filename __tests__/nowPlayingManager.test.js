import * as mod from '../utils/nowPlayingManager.js';

describe('nowPlayingManager exports', () => {
  test('exports functions', () => {
    expect(typeof mod.sendOrUpdateNowPlayingUI).toBe('function');
    expect(typeof mod.batchUpdateUI).toBe('function');
    expect(typeof mod.resetPlayerUIOptimized).toBe('function');
  });
});
