import { jest } from '@jest/globals';
import queueCmd from '../commands/queue/queue.js';

function createMessage() {
  return {
    guild: { id: '1' },
    channel: { send: jest.fn() },
    reply: jest.fn(),
    member: { voice: { channel: {} } }
  };
}

describe('queue command', () => {
  test('replies when nothing playing', async () => {
    const client = { lavalink: { getPlayer: () => null } };
    const message = createMessage();
    await queueCmd.execute(client, message, []);
    expect(message.reply).toHaveBeenCalledWith('No tracks are currently playing.');
  });

  test('invalid jump argument', async () => {
    const player = {
      queue: { current: {}, previous: [], tracks: [] }
    };
    const client = { lavalink: { getPlayer: () => player }, config: { prefix: '.' } };
    const message = createMessage();
    await queueCmd.execute(client, message, ['abc']);
    expect(message.reply).toHaveBeenCalledWith('Please provide a valid number as argument.');
  });
});
