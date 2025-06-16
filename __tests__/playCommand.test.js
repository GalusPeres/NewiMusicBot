import { jest } from '@jest/globals';
import playCmd from '../commands/playback/play.js';

describe('play command', () => {
  function createMessage() {
    return {
      guild: { id: '1' },
      member: { voice: { channel: null } },
      reply: jest.fn(),
      channel: { id: 'chan', send: jest.fn() },
      author: { tag: 'tester' },
      content: '.play song'
    };
  }

  test('rejects when lavalink not ready', async () => {
    const client = { lavalinkReady: false };
    const message = createMessage();
    await playCmd.execute(client, message, ['song']);
    expect(message.reply).toHaveBeenCalledWith('Lavalink is not ready. Please wait a moment and try again.');
  });

  test('requires voice channel', async () => {
    const client = { lavalinkReady: true };
    const message = createMessage();
    await playCmd.execute(client, message, ['song']);
    expect(message.reply).toHaveBeenCalledWith('You must join a voice channel first!');
  });
});
