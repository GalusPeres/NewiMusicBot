import { jest } from '@jest/globals';

jest.unstable_mockModule('../utils/logger.js', () => ({ default: { error: jest.fn() } }));
jest.unstable_mockModule('../utils/nowPlayingEmbed.js', () => ({
  generateNowPlayingEmbed: jest.fn(() => ({ embed: true })),
  generateStoppedEmbed: jest.fn(() => ({ stopped: true }))
}));
jest.unstable_mockModule('../utils/safeDiscord.js', () => ({ safeEdit: jest.fn(() => Promise.resolve()) }));
jest.unstable_mockModule('../utils/emojiUtils.js', () => ({ createButtonRowWithEmojis: jest.fn(() => 'row') }));

const { updateNowPlaying } = await import('../utils/updateNowPlaying.js');
const { safeEdit } = await import('../utils/safeDiscord.js');

describe('updateNowPlaying', () => {
  test('does nothing without message', () => {
    updateNowPlaying({});
    expect(safeEdit).not.toHaveBeenCalled();
  });

  test('updates embed only during stop confirmation', () => {
    const msg = {};
    updateNowPlaying({
      nowPlayingMessage: msg,
      stopConfirmationTimeout: 1,
      queue: { current: {} },
      guildId: '1'
    });
    expect(safeEdit).toHaveBeenCalledWith(msg, { embeds: [{ embed: true }] });
  });

  test('updates embed and components normally', () => {
    const msg = {};
    updateNowPlaying({
      nowPlayingMessage: msg,
      queue: { current: {} },
      guildId: '1'
    });
    expect(safeEdit).toHaveBeenCalledWith(msg, {
      embeds: [{ embed: true }],
      components: ['row']
    });
  });
});
