import { jest } from '@jest/globals';

jest.unstable_mockModule('../utils/logger.js', () => ({ default: { debug: jest.fn() } }));
jest.unstable_mockModule('../utils/nowPlayingEmbed.js', () => ({ generateStoppedEmbed: jest.fn(() => ({})) }));
jest.unstable_mockModule('../utils/safeDiscord.js', () => ({ safeEdit: jest.fn(() => Promise.resolve()) }));

const { togglePlayPause, performSkip, performStop } = await import('../utils/playerControls.js');
global.config = { defaultVolume: 50 };

describe('playerControls', () => {
  test('togglePlayPause resumes when paused', async () => {
    const resume = jest.fn();
    const player = { guildId: '1', paused: true, resume };
    await togglePlayPause(player);
    expect(resume).toHaveBeenCalled();
  });

  test('performSkip calls player.skip', async () => {
    const skip = jest.fn();
    const player = { guildId: '1', queue: { tracks: [1] }, skip };
    await performSkip(player);
    expect(skip).toHaveBeenCalled();
  });

  test('performStop clears queue and edits message', async () => {
    const stopPlaying = jest.fn();
    const setVolume = jest.fn();
    const message = {};
    const player = {
      guildId: '1',
      queue: { current: {}, tracks: [1], previous: [1] },
      nowPlayingCollector: { stop: jest.fn() },
      nowPlayingInterval: 1,
      nowPlayingMessage: message,
      stopPlaying,
      setVolume
    };
    await performStop(player);
    expect(stopPlaying).toHaveBeenCalled();
    expect(player.queue.tracks.length).toBe(0);
  });
});
